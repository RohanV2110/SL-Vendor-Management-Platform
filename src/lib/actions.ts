"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AgreementDocumentType, CommissionEntryType, CommissionLedgerStatus, CommissionType, DealStage, NoteEntityType } from "@prisma/client";
import { requirePartnerAccountId, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  activatePartnerAccount,
  approvePartnerAccount,
  completePartnerInvite,
  createClawback,
  createCommissionEntry,
  createManualAffiliate,
  createPartnerDeal,
  deletePartnerDeal,
  DuplicateAffiliateEmailError,
  createPayoutBatch,
  createReferral,
  createTierWithRule,
  generateVendorReferralCode,
  getStripeOnboardingLink,
  markPayoutBatchPaid,
  markStripeOnboardingComplete,
  refreshQuarterlyActivity,
  reviewPartnerApplication,
  reviewPartnerDeal,
  reviewReferral,
  sendAgreementDocuments,
  submitPartnerApplication,
  updateCommissionStatus,
  updatePartnerDeal,
  upsertDeal,
  uploadPartnerDocument,
  verifyPartnerDocument,
  type PartnerDealInput
} from "@/lib/services/platform";
import { env } from "@/lib/env";
import { slugify } from "@/lib/utils";
import {
  applicationSchema,
  dealSchema,
  payoutBatchSchema,
  referralReviewSchema,
  referralSchema,
  reviewApplicationSchema,
  tierSchema
} from "@/lib/validators/platform";

function getRequiredString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return value ? String(value) : undefined;
}

export async function completeInviteAction(_: string | undefined, formData: FormData) {
  const token = getRequiredString(formData, "token");
  const password = getRequiredString(formData, "password");
  const confirmPassword = getRequiredString(formData, "confirmPassword");

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  await completePartnerInvite({ token, password });
  redirect("/login");
}

export async function submitApplicationAction(_: string | undefined, formData: FormData) {
  const answerIds = formData.getAll("promptId").map(String);
  const answers = answerIds
    .map((id) => ({
      questionPromptId: id,
      response: getRequiredString(formData, `answer_${id}`).trim()
    }))
    .filter((answer) => answer.response.length > 0);

  const parsed = applicationSchema.safeParse({
    fullName: getRequiredString(formData, "fullName").trim(),
    email: getRequiredString(formData, "email"),
    password: getRequiredString(formData, "password"),
    phone: getRequiredString(formData, "phone").trim(),
    company: getRequiredString(formData, "company").trim(),
    country: getRequiredString(formData, "country").trim(),
    promotionChannels: getRequiredString(formData, "promotionChannels").trim(),
    aiTechExperience: getRequiredString(formData, "aiTechExperience").trim(),
    audienceDescription: getRequiredString(formData, "audienceDescription").trim(),
    productId: getRequiredString(formData, "productId").trim() || undefined,
    referralCode: getOptionalString(formData, "referralCode")?.trim(),
    answers
  });

  if (getRequiredString(formData, "password") !== getRequiredString(formData, "confirmPassword")) {
    return "Passwords do not match.";
  }

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid application.");
  }

  try {
    await submitPartnerApplication(parsed.data);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unable to create your account right now.";
  }

  redirect("/login?applied=1");
}

export async function checkApplicationEmailAction(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return undefined;
  }

  const [existingUser, existingPartnerAccount] = await Promise.all([
    prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    }),
    prisma.partnerAccount.findUnique({
      where: { primaryContactEmail: normalizedEmail },
      select: { id: true }
    })
  ]);

  if (existingUser || existingPartnerAccount) {
    return "An account with that email already exists. Please log in instead.";
  }

  return undefined;
}

export async function generateVendorReferralCodeAction(formData: FormData) {
  const user = await requireRole("PARTNER");
  const verifiedPartnerAccountId = await requirePartnerAccountId();
  const partnerAccountId = getRequiredString(formData, "partnerAccountId");

  if (partnerAccountId !== verifiedPartnerAccountId) {
    throw new Error("You can only manage your own referral code.");
  }

  const partner = await prisma.partnerAccount.findUnique({
    where: { id: verifiedPartnerAccountId },
    select: { status: true }
  });
  if (partner?.status !== "ACTIVE") {
    throw new Error("Your account is not active yet. Contact the admin.");
  }

  await generateVendorReferralCode({
    partnerAccountId,
    actorUserId: user.id
  });

  revalidatePath("/partner/referrals");
  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/affiliates");
  revalidatePath("/admin/vendors");
}

export type CreateAffiliateState = {
  status: "idle" | "error" | "success";
  error?: string;
  fieldErrors?: Partial<{
    name: string;
    email: string;
    phone: string;
    country: string;
    city: string;
  }>;
};

export async function createAffiliateAction(
  _prevState: CreateAffiliateState,
  formData: FormData
): Promise<CreateAffiliateState> {
  const user = await requireRole("PARTNER");
  const partnerAccountId = await requirePartnerAccountId();
  const socialFields = ["LinkedIn", "X / Twitter", "YouTube", "Instagram", "TikTok", "Website"];
  const socialProfiles = socialFields
    .map((label) => {
      const value = getOptionalString(formData, label)?.trim();
      return value ? `${label}: ${value}` : undefined;
    })
    .filter(Boolean)
    .join("\n");

  const name = getRequiredString(formData, "name").trim();
  const email = getRequiredString(formData, "email").trim().toLowerCase();
  const country = getOptionalString(formData, "country")?.trim() ?? "";
  const city = getOptionalString(formData, "city")?.trim() ?? "";
  const phoneCountryCode = getOptionalString(formData, "phoneCountryCode")?.trim() ?? "";
  const phoneNumber = getOptionalString(formData, "phoneNumber")?.trim() ?? "";

  const fieldErrors: NonNullable<CreateAffiliateState["fieldErrors"]> = {};

  if (!name) fieldErrors.name = "Name is required.";
  if (!email) fieldErrors.email = "Email is required.";
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!country) fieldErrors.country = "Select a country.";

  let phone = "";
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length !== 10) {
      fieldErrors.phone = "Mobile number must be exactly 10 digits.";
    } else if (!phoneCountryCode) {
      fieldErrors.phone = "Select a country code for the mobile number.";
    } else {
      phone = `${phoneCountryCode} ${digits}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const partnerStatus = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId },
    select: { status: true }
  });
  if (partnerStatus?.status !== "ACTIVE") {
    return {
      status: "error",
      error: "Your account is not active yet. Contact the admin."
    };
  }

  try {
    await createManualAffiliate({
      partnerAccountId,
      actorUserId: user.id,
      name,
      email,
      company: getOptionalString(formData, "company")?.trim(),
      phone: phone || undefined,
      country,
      city,
      socialProfiles,
      notes: getOptionalString(formData, "notes")?.trim()
    });
  } catch (error) {
    if (error instanceof DuplicateAffiliateEmailError) {
      return {
        status: "error",
        fieldErrors: { email: error.message }
      };
    }
    const message = error instanceof Error ? error.message : "Failed to add affiliate.";
    return { status: "error", error: message };
  }

  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/referrals");

  return { status: "success" };
}

export async function reviewApplicationAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = reviewApplicationSchema.safeParse({
    applicationId: getRequiredString(formData, "applicationId"),
    decision: getRequiredString(formData, "decision"),
    assignedTierId: getOptionalString(formData, "assignedTierId"),
    productId: getOptionalString(formData, "productId"),
    adminNotes: getOptionalString(formData, "adminNotes")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid review payload.");
  }

  await reviewPartnerApplication({
    ...parsed.data,
    adminUserId: admin.id
  });
  revalidatePath("/admin/applications");
}

export async function sendDocumentsAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await sendAgreementDocuments({
    partnerAccountId: getRequiredString(formData, "partnerAccountId"),
    adminUserId: admin.id
  });
  revalidatePath("/admin/applications");
}

export async function verifyDocumentAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await verifyPartnerDocument({
    partnerAccountId: getRequiredString(formData, "partnerAccountId"),
    type: getRequiredString(formData, "type") as AgreementDocumentType,
    adminUserId: admin.id
  });
  revalidatePath("/admin/applications");
}

export async function activatePartnerAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await activatePartnerAccount({
    partnerAccountId: getRequiredString(formData, "partnerAccountId"),
    adminUserId: admin.id
  });
  revalidatePath("/admin/applications");
  revalidatePath("/admin/partners");
}

export async function createReferralAction(formData: FormData) {
  const partnerAccountId = await requirePartnerAccountId();
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId },
    select: { status: true }
  });

  if (!partner || partner.status !== "ACTIVE") {
    throw new Error("Your partner account must be activated before you can submit referrals.");
  }

  const parsed = referralSchema.safeParse({
    productId: getRequiredString(formData, "productId"),
    packageId: getOptionalString(formData, "packageId"),
    referredCompany: getRequiredString(formData, "referredCompany"),
    referredContactName: getRequiredString(formData, "referredContactName"),
    referredContactEmail: getOptionalString(formData, "referredContactEmail"),
    referredDomain: getOptionalString(formData, "referredDomain"),
    sourceNotes: getRequiredString(formData, "sourceNotes"),
    useCaseSummary: getRequiredString(formData, "useCaseSummary"),
    estimatedDealValue: getOptionalString(formData, "estimatedDealValue")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid referral.");
  }

  await createReferral({
    ...parsed.data,
    partnerAccountId,
    attachment: formData.get("attachment") as File | null
  });
  revalidatePath("/partner/referrals");
  revalidatePath("/partner/dashboard");
}

export async function uploadDocumentAction(formData: FormData) {
  const partnerAccountId = await requirePartnerAccountId();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }

  await uploadPartnerDocument({
    partnerAccountId,
    type: getRequiredString(formData, "type") as AgreementDocumentType,
    file
  });

  revalidatePath("/partner/documents");
  revalidatePath("/admin/applications");
}

export async function reviewReferralAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = referralReviewSchema.safeParse({
    referralId: getRequiredString(formData, "referralId"),
    decision: getRequiredString(formData, "decision"),
    reason: getOptionalString(formData, "reason")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid referral review.");
  }

  await reviewReferral({
    ...parsed.data,
    adminUserId: admin.id
  });
  revalidatePath("/admin/referrals");
  revalidatePath("/partner/referrals");
}

export async function saveDealAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = dealSchema.safeParse({
    referralId: getRequiredString(formData, "referralId"),
    ownerName: getRequiredString(formData, "ownerName"),
    stage: getRequiredString(formData, "stage"),
    expectedValue: getOptionalString(formData, "expectedValue"),
    closedValue: getOptionalString(formData, "closedValue"),
    closeDate: getOptionalString(formData, "closeDate"),
    notes: getOptionalString(formData, "notes")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid deal.");
  }

  await upsertDeal({
    adminUserId: admin.id,
    referralId: parsed.data.referralId,
    ownerName: parsed.data.ownerName,
    stage: parsed.data.stage as DealStage,
    expectedValue: parsed.data.expectedValue,
    closedValue: parsed.data.closedValue,
    closeDate: parsed.data.closeDate,
    notes: parsed.data.notes
  });

  revalidatePath("/admin/deals");
  revalidatePath("/admin/commissions");
  revalidatePath("/partner/dashboard");
}

export async function updateCommissionStatusAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await updateCommissionStatus({
    adminUserId: admin.id,
    entryId: getRequiredString(formData, "entryId"),
    status: getRequiredString(formData, "status") as CommissionLedgerStatus
  });
  revalidatePath("/admin/commissions");
  revalidatePath("/partner/earnings");
}

export async function createClawbackAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await createClawback({
    adminUserId: admin.id,
    entryId: getRequiredString(formData, "entryId"),
    reason: getRequiredString(formData, "reason")
  });
  revalidatePath("/admin/commissions");
}

export async function createCommissionAction(formData: FormData) {
  const admin = await requireRole("ADMIN");

  const partnerAccountId = getRequiredString(formData, "partnerAccountId").trim();
  const typeRaw = getRequiredString(formData, "type").trim();
  const statusRaw = getOptionalString(formData, "status");
  const amountRaw = getRequiredString(formData, "amount").trim();
  const description = getRequiredString(formData, "description").trim();
  const referralId = getOptionalString(formData, "referralId")?.trim() || undefined;
  const scheduledForRaw = getOptionalString(formData, "scheduledFor")?.trim();

  if (!partnerAccountId) {
    throw new Error("Select a partner.");
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a valid number.");
  }
  if (!description) {
    throw new Error("Description is required.");
  }

  const allowedTypes: CommissionEntryType[] = [
    CommissionEntryType.UPFRONT,
    CommissionEntryType.TRAILING,
    CommissionEntryType.ADJUSTMENT
  ];
  const type = typeRaw as CommissionEntryType;
  if (!allowedTypes.includes(type)) {
    throw new Error("Unsupported commission type.");
  }

  const status = statusRaw ? (statusRaw as CommissionLedgerStatus) : undefined;

  await createCommissionEntry({
    adminUserId: admin.id,
    partnerAccountId,
    type,
    status,
    amount,
    description,
    referralId: referralId ?? null,
    scheduledFor: scheduledForRaw ? new Date(scheduledForRaw) : null
  });

  revalidatePath("/admin/commissions");
  revalidatePath("/partner/earnings");
}

export async function startStripeOnboardingAction() {
  if (!env.stripeSecretKey) throw new Error("Stripe Connect is not configured.");
  const partnerAccountId = await requirePartnerAccountId();
  const link = await getStripeOnboardingLink(partnerAccountId);
  redirect(link.url);
}

export async function confirmStripeOnboardingAction() {
  if (!env.stripeSecretKey) throw new Error("Stripe Connect is not configured.");
  const partnerAccountId = await requirePartnerAccountId();
  await markStripeOnboardingComplete(partnerAccountId);
  await refreshQuarterlyActivity(partnerAccountId);
  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/earnings");
}

export async function createPayoutBatchAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = payoutBatchSchema.safeParse({
    partnerAccountId: getRequiredString(formData, "partnerAccountId"),
    label: getRequiredString(formData, "label"),
    entryIds: formData.getAll("entryIds").map(String)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid payout batch.");
  }

  await createPayoutBatch({
    ...parsed.data,
    adminUserId: admin.id
  });
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/commissions");
}

export async function markPayoutBatchPaidAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  await markPayoutBatchPaid({
    adminUserId: admin.id,
    batchId: getRequiredString(formData, "batchId"),
    stripePayoutId: getOptionalString(formData, "stripePayoutId")
  });
  revalidatePath("/admin/payouts");
  revalidatePath("/partner/earnings");
}

export async function createTierAction(formData: FormData) {
  await requireRole("ADMIN");
  const parsed = tierSchema.safeParse({
    name: getRequiredString(formData, "name"),
    description: getOptionalString(formData, "description"),
    productId: getOptionalString(formData, "productId"),
    packageId: getOptionalString(formData, "packageId"),
    upfrontCommissionType: getRequiredString(formData, "upfrontCommissionType"),
    upfrontCommissionValue: getRequiredString(formData, "upfrontCommissionValue"),
    trailingCommissionType: getOptionalString(formData, "trailingCommissionType"),
    trailingCommissionValue: getOptionalString(formData, "trailingCommissionValue"),
    trailingDurationMonths: getOptionalString(formData, "trailingDurationMonths"),
    trailingCadenceMonths: getOptionalString(formData, "trailingCadenceMonths"),
    clawbackWindowDays: getOptionalString(formData, "clawbackWindowDays"),
    quarterlyApprovedReferralsMin: getOptionalString(formData, "quarterlyApprovedReferralsMin"),
    quarterlyConvertedDealsMin: getOptionalString(formData, "quarterlyConvertedDealsMin"),
    quarterlyRevenueMin: getOptionalString(formData, "quarterlyRevenueMin"),
    quarterlyCommissionMin: getOptionalString(formData, "quarterlyCommissionMin")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid tier.");
  }

  await createTierWithRule({
    name: parsed.data.name,
    description: parsed.data.description,
    productId: parsed.data.productId,
    packageId: parsed.data.packageId,
    upfrontCommissionType: parsed.data.upfrontCommissionType as CommissionType,
    upfrontCommissionValue: parsed.data.upfrontCommissionValue,
    trailingCommissionType: parsed.data.trailingCommissionType as CommissionType | undefined,
    trailingCommissionValue: parsed.data.trailingCommissionValue,
    trailingDurationMonths: parsed.data.trailingDurationMonths,
    trailingCadenceMonths: parsed.data.trailingCadenceMonths,
    clawbackWindowDays: parsed.data.clawbackWindowDays,
    quarterlyApprovedReferralsMin: parsed.data.quarterlyApprovedReferralsMin,
    quarterlyConvertedDealsMin: parsed.data.quarterlyConvertedDealsMin,
    quarterlyRevenueMin: parsed.data.quarterlyRevenueMin,
    quarterlyCommissionMin: parsed.data.quarterlyCommissionMin
  });
  revalidatePath("/admin/tiers");
}

export async function updateTierAction(formData: FormData) {
  await requireRole("ADMIN");
  const tierId = getRequiredString(formData, "tierId");
  const parsed = tierSchema.safeParse({
    name: getRequiredString(formData, "name"),
    description: getOptionalString(formData, "description"),
    productId: getOptionalString(formData, "productId"),
    packageId: getOptionalString(formData, "packageId"),
    upfrontCommissionType: getRequiredString(formData, "upfrontCommissionType"),
    upfrontCommissionValue: getRequiredString(formData, "upfrontCommissionValue"),
    trailingCommissionType: getOptionalString(formData, "trailingCommissionType"),
    trailingCommissionValue: getOptionalString(formData, "trailingCommissionValue"),
    trailingDurationMonths: getOptionalString(formData, "trailingDurationMonths"),
    trailingCadenceMonths: getOptionalString(formData, "trailingCadenceMonths"),
    clawbackWindowDays: getOptionalString(formData, "clawbackWindowDays"),
    quarterlyApprovedReferralsMin: getOptionalString(formData, "quarterlyApprovedReferralsMin"),
    quarterlyConvertedDealsMin: getOptionalString(formData, "quarterlyConvertedDealsMin"),
    quarterlyRevenueMin: getOptionalString(formData, "quarterlyRevenueMin"),
    quarterlyCommissionMin: getOptionalString(formData, "quarterlyCommissionMin")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid tier.");
  }

  const tier = await prisma.tier.findUnique({
    where: { id: tierId },
    include: { rules: { orderBy: { createdAt: "asc" }, take: 1 } }
  });

  if (!tier) {
    throw new Error("Tier not found.");
  }

  await prisma.tier.update({
    where: { id: tierId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      rules: tier.rules[0]
        ? {
            update: {
              where: { id: tier.rules[0].id },
              data: {
                productId: parsed.data.productId || null,
                packageId: parsed.data.packageId || null,
                upfrontCommissionType: parsed.data.upfrontCommissionType as CommissionType,
                upfrontCommissionValue: parsed.data.upfrontCommissionValue,
                trailingCommissionType: parsed.data.trailingCommissionType as CommissionType | undefined,
                trailingCommissionValue: parsed.data.trailingCommissionValue,
                trailingDurationMonths: parsed.data.trailingDurationMonths,
                trailingCadenceMonths: parsed.data.trailingCadenceMonths,
                clawbackWindowDays: parsed.data.clawbackWindowDays,
                quarterlyApprovedReferralsMin: parsed.data.quarterlyApprovedReferralsMin,
                quarterlyConvertedDealsMin: parsed.data.quarterlyConvertedDealsMin,
                quarterlyRevenueMin: parsed.data.quarterlyRevenueMin,
                quarterlyCommissionMin: parsed.data.quarterlyCommissionMin
              }
            }
          }
        : {
            create: {
              productId: parsed.data.productId || null,
              packageId: parsed.data.packageId || null,
              upfrontCommissionType: parsed.data.upfrontCommissionType as CommissionType,
              upfrontCommissionValue: parsed.data.upfrontCommissionValue,
              trailingCommissionType: parsed.data.trailingCommissionType as CommissionType | undefined,
              trailingCommissionValue: parsed.data.trailingCommissionValue,
              trailingDurationMonths: parsed.data.trailingDurationMonths,
              trailingCadenceMonths: parsed.data.trailingCadenceMonths,
              clawbackWindowDays: parsed.data.clawbackWindowDays,
              quarterlyApprovedReferralsMin: parsed.data.quarterlyApprovedReferralsMin,
              quarterlyConvertedDealsMin: parsed.data.quarterlyConvertedDealsMin,
              quarterlyRevenueMin: parsed.data.quarterlyRevenueMin,
              quarterlyCommissionMin: parsed.data.quarterlyCommissionMin
            }
          }
    }
  });

  revalidatePath("/admin/tiers");
}

export async function deleteTierAction(formData: FormData) {
  await requireRole("ADMIN");
  const tierId = getRequiredString(formData, "tierId");

  const tier = await prisma.tier.findUnique({
    where: { id: tierId },
    include: {
      _count: {
        select: {
          partners: true,
          agreements: true,
          applications: true,
          snapshots: true
        }
      }
    }
  });

  if (!tier) {
    throw new Error("Tier not found.");
  }

  const isInUse =
    tier._count.partners > 0 || tier._count.agreements > 0 || tier._count.applications > 0 || tier._count.snapshots > 0;

  if (isInUse) {
    await prisma.tier.update({
      where: { id: tierId },
      data: { isActive: false }
    });
  } else {
    await prisma.tier.delete({
      where: { id: tierId }
    });
  }

  revalidatePath("/admin/tiers");
}

export async function refreshQuarterlyActivityAction() {
  const partnerAccountId = await requirePartnerAccountId();

  await refreshQuarterlyActivity(partnerAccountId);
  revalidatePath("/partner/activity");
  revalidatePath("/partner/dashboard");
}

export async function createProductAction(formData: FormData) {
  await requireRole("ADMIN");
  const name = getRequiredString(formData, "name");
  const description = getOptionalString(formData, "description");

  await prisma.product.create({
    data: {
      name,
      slug: slugify(name),
      description
    }
  });

  revalidatePath("/admin/products");
}

export async function createPackageAction(formData: FormData) {
  await requireRole("ADMIN");
  const name = getRequiredString(formData, "name");
  const description = getOptionalString(formData, "description");
  const productId = getRequiredString(formData, "productId");

  await prisma.package.create({
    data: {
      name,
      slug: slugify(name),
      description,
      productId
    }
  });

  revalidatePath("/admin/products");
}

export async function createQuestionPromptAction(formData: FormData) {
  await requireRole("ADMIN");
  await prisma.questionPrompt.create({
    data: {
      productId: getOptionalString(formData, "productId") || null,
      label: getRequiredString(formData, "label"),
      helperText: getOptionalString(formData, "helperText"),
      promptType: "textarea",
      sortOrder: Number(getOptionalString(formData, "sortOrder") ?? "99"),
      isRequired: formData.get("isRequired") === "on"
    }
  });

  revalidatePath("/admin/questionnaire");
}

export async function deleteQuestionPromptAction(formData: FormData) {
  await requireRole("ADMIN");
  const id = getRequiredString(formData, "id").trim();
  if (!id) {
    throw new Error("Question id is required.");
  }
  await prisma.questionPrompt.update({
    where: { id },
    data: { isActive: false }
  });
  revalidatePath("/admin/questionnaire");
}

export async function addInternalNoteAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const entityType = getRequiredString(formData, "entityType");
  const entityId = getRequiredString(formData, "entityId");
  const body = getRequiredString(formData, "body");

  await prisma.internalNote.create({
    data: {
      entityType: entityType as NoteEntityType,
      entityId,
      body,
      authorId: admin.id,
      applicationId: entityType === "APPLICATION" ? entityId : null,
      partnerAccountId: entityType === "PARTNER" ? entityId : null,
      referralId: entityType === "REFERRAL" ? entityId : null,
      dealId: entityType === "DEAL" ? entityId : null
    }
  });

  revalidatePath("/admin/applications");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/referrals");
  revalidatePath("/admin/deals");
}

export async function approvePartnerAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const partnerAccountId = getRequiredString(formData, "partnerAccountId").trim();
  if (!partnerAccountId) {
    throw new Error("Partner is required.");
  }

  await approvePartnerAccount({ partnerAccountId, adminUserId: admin.id });

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerAccountId}`);
  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/referrals");
}

export async function acknowledgePartnerActivationAction() {
  const partnerAccountId = await requirePartnerAccountId();
  await prisma.partnerAccount.update({
    where: { id: partnerAccountId },
    data: { activationNoticeSeenAt: new Date() }
  });
}

export type PartnerDealFormState = {
  status: "idle" | "error" | "success";
  error?: string;
  fieldErrors?: Partial<{
    name: string;
    email: string;
    companyName: string;
    website: string;
    phone: string;
    country: string;
    state: string;
    notes: string;
  }>;
};

const dealEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePartnerDealInput(formData: FormData): {
  data?: PartnerDealInput;
  fieldErrors: NonNullable<PartnerDealFormState["fieldErrors"]>;
} {
  const fieldErrors: NonNullable<PartnerDealFormState["fieldErrors"]> = {};

  const name = getRequiredString(formData, "name").trim();
  const email = getRequiredString(formData, "email").trim();
  const companyName = getRequiredString(formData, "companyName").trim();
  const website = (getOptionalString(formData, "website") ?? "").trim();
  const phoneCountryCode = (getOptionalString(formData, "phoneCountryCode") ?? "").trim();
  const phoneNumber = (getOptionalString(formData, "phoneNumber") ?? "").trim();
  const country = getRequiredString(formData, "country").trim();
  const stateValue = getRequiredString(formData, "state").trim();
  const notes = (getOptionalString(formData, "notes") ?? "").trim();

  if (!name) fieldErrors.name = "Name is required.";
  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (!dealEmailRegex.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (!companyName) fieldErrors.companyName = "Company name is required.";
  if (!country) fieldErrors.country = "Country is required.";
  if (!stateValue) fieldErrors.state = "State is required.";

  if (phoneNumber) {
    if (!/^\d{10}$/.test(phoneNumber)) {
      fieldErrors.phone = "Phone number must be exactly 10 digits.";
    } else if (!phoneCountryCode) {
      fieldErrors.phone = "Select a country code for the phone number.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    fieldErrors,
    data: {
      name,
      email,
      companyName,
      website: website || null,
      phoneCountryCode: phoneCountryCode || null,
      phoneNumber: phoneNumber || null,
      country,
      state: stateValue,
      notes: notes || null
    }
  };
}

export async function createPartnerDealAction(
  _prevState: PartnerDealFormState,
  formData: FormData
): Promise<PartnerDealFormState> {
  const partnerAccountId = await requirePartnerAccountId();

  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId },
    select: { status: true }
  });
  if (partner?.status !== "ACTIVE") {
    return {
      status: "error",
      error: "Your account is not active yet. Contact the admin."
    };
  }

  const { data, fieldErrors } = parsePartnerDealInput(formData);
  if (!data) {
    return { status: "error", fieldErrors };
  }

  try {
    await createPartnerDeal({ partnerAccountId, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add deal.";
    return { status: "error", error: message };
  }

  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/dashboard");
  revalidatePath("/admin/deals");
  revalidatePath("/admin");
  return { status: "success" };
}

export async function updatePartnerDealAction(
  _prevState: PartnerDealFormState,
  formData: FormData
): Promise<PartnerDealFormState> {
  const dealId = getRequiredString(formData, "dealId").trim();
  if (!dealId) {
    return { status: "error", error: "Deal id is required." };
  }

  const { data, fieldErrors } = parsePartnerDealInput(formData);
  if (!data) {
    return { status: "error", fieldErrors };
  }

  const role = getRequiredString(formData, "actorRole") === "ADMIN" ? "ADMIN" : "PARTNER";

  try {
    if (role === "ADMIN") {
      const admin = await requireRole("ADMIN");
      await updatePartnerDeal({
        dealId,
        actorUserId: admin.id,
        actorRole: "ADMIN",
        data
      });
    } else {
      const user = await requireRole("PARTNER");
      const partnerAccountId = await requirePartnerAccountId();
      await updatePartnerDeal({
        dealId,
        actorUserId: user.id,
        actorRole: "PARTNER",
        partnerAccountId,
        data
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update deal.";
    return { status: "error", error: message };
  }

  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/dashboard");
  revalidatePath("/admin/deals");
  return { status: "success" };
}

export async function reviewPartnerDealAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const dealId = getRequiredString(formData, "dealId").trim();
  const decisionRaw = getRequiredString(formData, "decision").trim();
  const decision = decisionRaw === "APPROVED" ? "APPROVED" : decisionRaw === "REJECTED" ? "REJECTED" : null;
  const rejectionReason = (getOptionalString(formData, "rejectionReason") ?? "").trim() || null;

  if (!dealId) {
    throw new Error("Deal id is required.");
  }
  if (!decision) {
    throw new Error("Invalid decision.");
  }

  await reviewPartnerDeal({
    dealId,
    decision,
    adminUserId: admin.id,
    rejectionReason
  });

  revalidatePath("/admin/deals");
  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/dashboard");
}

export async function deletePartnerDealAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const dealId = getRequiredString(formData, "dealId").trim();
  if (!dealId) {
    throw new Error("Deal id is required.");
  }

  await deletePartnerDeal({ dealId, adminUserId: admin.id });

  revalidatePath("/admin/deals");
  revalidatePath("/partner/affiliates");
  revalidatePath("/partner/dashboard");
}
