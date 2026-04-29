"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AgreementDocumentType, CommissionLedgerStatus, CommissionType, DealStage, NoteEntityType } from "@prisma/client";
import { requireRole, requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  activatePartnerAccount,
  completePartnerInvite,
  createClawback,
  createPayoutBatch,
  createReferral,
  createTierWithRule,
  generateVendorReferralCode,
  getStripeOnboardingLink,
  markPayoutBatchPaid,
  markStripeOnboardingComplete,
  refreshQuarterlyActivity,
  reviewPartnerApplication,
  reviewReferral,
  sendAgreementDocuments,
  submitPartnerApplication,
  updateCommissionStatus,
  upsertDeal,
  uploadPartnerDocument,
  verifyPartnerDocument
} from "@/lib/services/platform";
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

export async function generateVendorReferralCodeAction(formData: FormData) {
  const user = await requireRole("PARTNER");
  const partnerAccountId = getRequiredString(formData, "partnerAccountId");

  if (partnerAccountId !== user.partnerAccountId) {
    throw new Error("You can only manage your own referral code.");
  }

  await generateVendorReferralCode({
    partnerAccountId,
    actorUserId: user.id
  });

  revalidatePath("/partner/referrals");
  revalidatePath("/admin/vendors");
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
  const user = await requireRole("PARTNER");
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: user.partnerAccountId! },
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
    partnerAccountId: user.partnerAccountId!,
    attachment: formData.get("attachment") as File | null
  });
  revalidatePath("/partner/referrals");
  revalidatePath("/partner/dashboard");
}

export async function uploadDocumentAction(formData: FormData) {
  const user = await requireRole("PARTNER");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }

  await uploadPartnerDocument({
    partnerAccountId: user.partnerAccountId!,
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

export async function startStripeOnboardingAction() {
  const user = await requireRole("PARTNER");
  const link = await getStripeOnboardingLink(user.partnerAccountId!);
  redirect(link.url);
}

export async function confirmStripeOnboardingAction() {
  const user = await requireRole("PARTNER");
  await markStripeOnboardingComplete(user.partnerAccountId!);
  await refreshQuarterlyActivity(user.partnerAccountId!);
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
  const user = await requireUser();
  if (user.role !== "PARTNER" || !user.partnerAccountId) {
    return;
  }

  await refreshQuarterlyActivity(user.partnerAccountId);
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
