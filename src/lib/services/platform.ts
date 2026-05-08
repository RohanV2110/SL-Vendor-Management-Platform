import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  AgreementDocumentStatus,
  AgreementDocumentType,
  AgreementStatus,
  CommissionEntryType,
  CommissionLedgerStatus,
  CommissionType,
  DealStage,
  PartnerAccountStatus,
  PartnerApplicationStatus,
  PayoutBatchStatus,
  Prisma,
  QuarterlyActivityStatus,
  ReferralStatus,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { buildAriesReferralLink } from "@/lib/referral-links";
import { calculateCommissionAmount, deriveReferralSubmissionStatus, evaluateQuarterlyActivity } from "@/lib/rules";
import { saveUploadedFile } from "@/lib/storage";
import { createConnectOnboardingLink, provisionConnectAccount } from "@/lib/stripe";
import { endOfQuarter, getQuarter, normalizeLeadKey, slugify, startOfQuarter } from "@/lib/utils";

type AuditPayload = {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  previousState?: Prisma.InputJsonValue;
  nextState?: Prisma.InputJsonValue;
};

async function createAuditLog(tx: Prisma.TransactionClient, payload: AuditPayload) {
  await tx.auditLog.create({
    data: payload
  });
}

async function createPartnerNotification(
  tx: Prisma.TransactionClient,
  partnerAccountId: string,
  title: string,
  body: string,
  href?: string
) {
  await tx.notification.create({
    data: {
      partnerAccountId,
      title,
      body,
      href
    }
  });
}

async function createAdminNotifications(
  tx: Prisma.TransactionClient,
  title: string,
  body: string,
  href?: string
) {
  const admins = await tx.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true },
    select: { id: true }
  });

  if (!admins.length) {
    return;
  }

  await tx.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title,
      body,
      href
    }))
  });
}

async function resolveActiveAgreement(partnerAccountId: string, productId: string, packageId?: string | null) {
  const agreement =
    (await prisma.agreement.findFirst({
      where: {
        partnerAccountId,
        status: AgreementStatus.ACTIVE,
        AND: [
          {
            OR: [{ productId }, { productId: null }]
          },
          {
            OR: packageId ? [{ packageId }, { packageId: null }] : [{ packageId: null }]
          }
        ]
      },
      orderBy: [{ effectiveStartDate: "desc" }, { version: "desc" }]
    })) ??
    (await prisma.agreement.findFirst({
      where: {
        partnerAccountId,
        status: {
          in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE]
        }
      },
      orderBy: [{ effectiveStartDate: "desc" }, { version: "desc" }]
    }));

  if (!agreement) {
    throw new Error("No agreement found for partner.");
  }

  return agreement;
}

async function resolveTierRule(tierId: string, productId: string, packageId?: string | null) {
  const packageMatch = packageId
    ? await prisma.tierRule.findFirst({
        where: { tierId, productId, packageId, isActive: true }
      })
    : null;

  if (packageMatch) {
    return packageMatch;
  }

  const productMatch = await prisma.tierRule.findFirst({
    where: {
      tierId,
      isActive: true,
      AND: [
        {
          OR: [{ productId }, { productId: null }]
        },
        {
          packageId: null
        }
      ]
    }
  });

  if (!productMatch) {
    throw new Error("No active tier rule found.");
  }

  return productMatch;
}

function buildInviteUrl(token: string) {
  return `${env.appBaseUrl}/login/setup?token=${token}`;
}

function normalizeReferralCode(value?: string | null) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "") || undefined;
}

async function generateUniqueAffiliateId(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `AFF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const existing = await tx.partnerAccount.findUnique({ where: { affiliateId: id }, select: { id: true } });
    if (!existing) {
      return id;
    }
  }

  throw new Error("Unable to generate a unique affiliate ID.");
}

async function generateUniqueVendorReferralCode(tx: Prisma.TransactionClient, name: string) {
  const prefix = slugify(name).replace(/-/g, "").toUpperCase().slice(0, 10) || "VENDOR";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${prefix}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await tx.partnerAccount.findUnique({ where: { vendorReferralCode: code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to generate a unique vendor referral code.");
}

async function ensureAgreementDocuments(
  tx: Prisma.TransactionClient,
  partnerAccountId: string,
  agreementId: string
) {
  for (const type of [AgreementDocumentType.NDA, AgreementDocumentType.PARTNER_AGREEMENT]) {
    await tx.agreementDocument.upsert({
      where: {
        partnerAccountId_type: {
          partnerAccountId,
          type
        }
      },
      update: {
        agreementId,
        status: AgreementDocumentStatus.REQUESTED
      },
      create: {
        partnerAccountId,
        agreementId,
        type,
        status: AgreementDocumentStatus.REQUESTED
      }
    });
  }
}

export async function getPortalReferenceData() {
  const [products, tiers, prompts] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        packages: {
          where: { isActive: true },
          orderBy: { name: "asc" }
        }
      },
      orderBy: { name: "asc" }
    }),
    prisma.tier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    }),
    prisma.questionPrompt.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    })
  ]);

  return { products, tiers, prompts };
}

export async function submitPartnerApplication(input: {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  company: string;
  country: string;
  promotionChannels: string;
  aiTechExperience: string;
  audienceDescription: string;
  productId?: string;
  referralCode?: string;
  answers: Array<{ questionPromptId: string; response: string }>;
}) {
  const prompts = await prisma.questionPrompt.findMany({
    where: {
      id: { in: input.answers.map((answer) => answer.questionPromptId) }
    }
  });

  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const referralCode = normalizeReferralCode(input.referralCode);

  const application = await prisma.$transaction(async (tx) => {
    const referringVendor = referralCode
      ? await tx.partnerAccount.findUnique({
          where: { vendorReferralCode: referralCode },
          select: { id: true, primaryContactEmail: true, vendorReferralCodeActive: true }
        })
      : null;

    if (referralCode && (!referringVendor || !referringVendor.vendorReferralCodeActive)) {
      throw new Error("The referral code is invalid or inactive.");
    }

    if (referringVendor?.primaryContactEmail.toLowerCase() === input.email.toLowerCase()) {
      throw new Error("A vendor cannot use their own referral code.");
    }

    const existingPartnerAccount = await tx.partnerAccount.findUnique({
      where: { primaryContactEmail: input.email },
      include: {
        profile: true,
        user: true,
        application: {
          include: {
            answers: true
          }
        }
      }
    });

    const existingUser =
      existingPartnerAccount?.user ??
      (await tx.user.findUnique({
        where: { email: input.email }
      }));

    if (existingUser && (!existingPartnerAccount || existingUser.partnerAccountId === existingPartnerAccount.id)) {
      throw new Error("An account with that email already exists. Please log in instead.");
    }

    const defaultTier =
      (await tx.tier.findFirst({
        where: {
          isActive: true,
          isDefault: true
        },
        orderBy: { createdAt: "asc" }
      })) ??
      (await tx.tier.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" }
      }));

    if (!defaultTier) {
      throw new Error("No active partner tier is configured.");
    }

    const latestUnboundApplication = existingPartnerAccount
      ? null
      : await tx.partnerApplication.findFirst({
          where: {
            email: input.email,
            partnerAccount: null
          },
          orderBy: { createdAt: "desc" },
          include: { answers: true }
        });

    const applicationStatus = referringVendor ? PartnerApplicationStatus.ACTIVE : PartnerApplicationStatus.SUBMITTED;
    const accountStatus = referringVendor ? PartnerAccountStatus.ACTIVE : PartnerAccountStatus.INACTIVE;

    const created =
      existingPartnerAccount?.application ??
      (latestUnboundApplication
        ? await tx.partnerApplication.update({
            where: { id: latestUnboundApplication.id },
            data: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              company: input.company,
              country: input.country,
              promotionChannels: input.promotionChannels,
              aiTechExperience: input.aiTechExperience,
              audienceDescription: input.audienceDescription,
              productId: input.productId ?? null,
              referredByVendorId: referringVendor?.id ?? null,
              referralCodeUsed: referralCode ?? null,
              status: applicationStatus,
              answers: {
                deleteMany: {},
                create: input.answers.map((answer) => ({
                  questionPromptId: answer.questionPromptId,
                  promptSnapshot: promptMap.get(answer.questionPromptId)?.label ?? "Question",
                  response: answer.response
                }))
              }
            }
          })
        : await tx.partnerApplication.create({
            data: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              company: input.company,
              country: input.country,
              promotionChannels: input.promotionChannels,
              aiTechExperience: input.aiTechExperience,
              audienceDescription: input.audienceDescription,
              productId: input.productId ?? null,
              referredByVendorId: referringVendor?.id ?? null,
              referralCodeUsed: referralCode ?? null,
              status: applicationStatus,
              answers: {
                create: input.answers.map((answer) => ({
                  questionPromptId: answer.questionPromptId,
                  promptSnapshot: promptMap.get(answer.questionPromptId)?.label ?? "Question",
                  response: answer.response
                }))
              }
            }
          }));

    const partnerAccount =
      existingPartnerAccount ??
      (await tx.partnerAccount.create({
        data: {
          applicationId: created.id,
          tierId: defaultTier.id,
          company: input.company,
          primaryContactName: input.fullName,
          primaryContactEmail: input.email,
          affiliateId: await generateUniqueAffiliateId(tx),
          referredByVendorId: referringVendor?.id ?? null,
          referralCodeUsed: referralCode ?? null,
          phone: input.phone,
          country: input.country,
          status: accountStatus,
          profile: {
            create: {
              promotionChannels: input.promotionChannels,
              aiTechExperience: input.aiTechExperience,
              audienceDescription: input.audienceDescription
            }
          }
        }
      }));

    if (existingPartnerAccount) {
      await tx.partnerApplication.update({
        where: { id: created.id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          company: input.company,
          country: input.country,
          promotionChannels: input.promotionChannels,
          aiTechExperience: input.aiTechExperience,
          audienceDescription: input.audienceDescription,
          productId: input.productId ?? created.productId,
          referredByVendorId: created.referredByVendorId ?? referringVendor?.id ?? null,
          referralCodeUsed: created.referralCodeUsed ?? referralCode ?? null,
          answers: {
            deleteMany: {},
            create: input.answers.map((answer) => ({
              questionPromptId: answer.questionPromptId,
              promptSnapshot: promptMap.get(answer.questionPromptId)?.label ?? "Question",
              response: answer.response
            }))
          }
        }
      });

      await tx.partnerAccount.update({
        where: { id: existingPartnerAccount.id },
        data: {
          tierId: existingPartnerAccount.tierId ?? defaultTier.id,
          company: input.company,
          primaryContactName: input.fullName,
          affiliateId: existingPartnerAccount.affiliateId ?? (await generateUniqueAffiliateId(tx)),
          referredByVendorId: existingPartnerAccount.referredByVendorId ?? referringVendor?.id ?? null,
          referralCodeUsed: existingPartnerAccount.referralCodeUsed ?? referralCode ?? null,
          phone: input.phone,
          country: input.country
        }
      });

      if (existingPartnerAccount.profile) {
        await tx.partnerProfile.update({
          where: { partnerAccountId: existingPartnerAccount.id },
          data: {
            promotionChannels: input.promotionChannels,
            aiTechExperience: input.aiTechExperience,
            audienceDescription: input.audienceDescription
          }
        });
      } else {
        await tx.partnerProfile.create({
          data: {
            partnerAccountId: existingPartnerAccount.id,
            promotionChannels: input.promotionChannels,
            aiTechExperience: input.aiTechExperience,
            audienceDescription: input.audienceDescription
          }
        });
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    if (existingUser) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          name: input.fullName,
          role: UserRole.PARTNER,
          partnerAccountId: partnerAccount.id,
          isActive: true
        }
      });
    } else {
      await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.fullName,
          role: UserRole.PARTNER,
          partnerAccountId: partnerAccount.id,
          isActive: true
        }
      });
    }

    await createAuditLog(tx, {
      entityType: "PartnerApplication",
      entityId: created.id,
      action: existingPartnerAccount ? "application.restored_login" : "application.submitted",
      summary: existingPartnerAccount
        ? `Application access restored for ${input.fullName}`
        : `Application submitted by ${input.fullName}`,
      nextState: { status: created.status }
    });

    if (!existingPartnerAccount) {
      await createAdminNotifications(
        tx,
        "New partner application",
        `${input.fullName} from ${input.company} submitted an application.`,
        `/admin/applications`
      );
    }

    return created;
  });

  await sendTransactionalEmail({
    to: input.email,
    subject: "Sugar & Leather AI partner application access",
    html: `<p>Thanks, ${input.fullName}. Your partner account is ready to log in. You can track your onboarding status in the portal.</p>`
  });

  return application;
}

export async function generateVendorReferralCode(input: { partnerAccountId: string; actorUserId?: string }) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId },
      select: {
        id: true,
        company: true,
        primaryContactName: true,
        vendorReferralCode: true,
        vendorReferralCodeActive: true
      }
    });

    if (!partner) {
      throw new Error("Vendor not found.");
    }

    const code =
      partner.vendorReferralCode && partner.vendorReferralCodeActive
        ? partner.vendorReferralCode
        : await generateUniqueVendorReferralCode(tx, partner.company || partner.primaryContactName);

    const updated = await tx.partnerAccount.update({
      where: { id: partner.id },
      data: {
        vendorReferralCode: code,
        vendorReferralCodeActive: true,
        vendorReferralCodeGeneratedAt: new Date()
      },
      select: { id: true, vendorReferralCode: true }
    });

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      entityType: "PartnerAccount",
      entityId: partner.id,
      action: "vendor.referral_code.generated",
      summary: `Vendor referral code generated for ${partner.company || partner.primaryContactName}`,
      previousState: { vendorReferralCode: partner.vendorReferralCode, active: partner.vendorReferralCodeActive },
      nextState: { vendorReferralCode: updated.vendorReferralCode, active: true }
    });

    return {
      code: updated.vendorReferralCode!,
      link: buildAriesReferralLink(updated.vendorReferralCode!)
    };
  });
}

export class DuplicateAffiliateEmailError extends Error {
  constructor(message = "An account with that email already exists.") {
    super(message);
    this.name = "DuplicateAffiliateEmailError";
  }
}

export async function createManualAffiliate(input: {
  partnerAccountId: string;
  actorUserId: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  country?: string;
  city?: string;
  socialProfiles?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId },
      select: {
        id: true,
        tierId: true,
        vendorReferralCode: true,
        primaryContactEmail: true
      }
    });

    if (!partner) {
      throw new Error("Partner account not found.");
    }

    if (partner.primaryContactEmail.toLowerCase() === input.email.toLowerCase()) {
      throw new Error("You cannot add yourself as an affiliate.");
    }

    const existing = await tx.partnerAccount.findUnique({
      where: { primaryContactEmail: input.email },
      select: { id: true }
    });

    if (existing) {
      throw new DuplicateAffiliateEmailError(
        "An account with that email already exists. Please use a different email."
      );
    }

    const defaultTier =
      (await tx.tier.findFirst({
        where: { isActive: true, isDefault: true },
        orderBy: { createdAt: "asc" }
      })) ??
      (await tx.tier.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" }
      }));

    if (!defaultTier) {
      throw new Error("No active partner tier is configured.");
    }

    const company = input.company?.trim() || input.name;
    const country = input.country?.trim() ?? "";
    const city = input.city?.trim() ?? "";
    const application = await tx.partnerApplication.create({
      data: {
        fullName: input.name,
        email: input.email,
        phone: input.phone ?? "",
        company,
        country,
        city,
        promotionChannels: input.socialProfiles ?? "",
        aiTechExperience: "",
        audienceDescription: input.notes ?? "",
        assignedTierId: defaultTier.id,
        referredByVendorId: partner.id,
        referralCodeUsed: partner.vendorReferralCode,
        status: PartnerApplicationStatus.ACTIVE,
        activatedAt: new Date()
      }
    });

    const affiliate = await tx.partnerAccount.create({
      data: {
        applicationId: application.id,
        tierId: defaultTier.id,
        affiliateId: await generateUniqueAffiliateId(tx),
        referredByVendorId: partner.id,
        referralCodeUsed: partner.vendorReferralCode,
        company,
        primaryContactName: input.name,
        primaryContactEmail: input.email,
        phone: input.phone ?? "",
        country,
        city,
        status: PartnerAccountStatus.ACTIVE,
        activatedAt: new Date(),
        profile: {
          create: {
            promotionChannels: input.socialProfiles ?? "",
            aiTechExperience: "",
            audienceDescription: input.notes ?? ""
          }
        }
      }
    });

    if (input.notes?.trim()) {
      await tx.internalNote.create({
        data: {
          entityType: "PARTNER",
          entityId: affiliate.id,
          body: input.notes.trim(),
          authorId: input.actorUserId,
          partnerAccountId: affiliate.id
        }
      });
    }

    await createAuditLog(tx, {
      actorUserId: input.actorUserId,
      entityType: "PartnerAccount",
      entityId: affiliate.id,
      action: "affiliate.created_by_partner",
      summary: `${input.name} was added as an affiliate.`,
      nextState: {
        affiliateId: affiliate.affiliateId,
        referredByVendorId: partner.id,
        status: affiliate.status
      }
    });

    return affiliate;
  });
}

export async function reviewPartnerApplication(input: {
  applicationId: string;
  adminUserId: string;
  decision: "approve" | "reject";
  assignedTierId?: string;
  productId?: string;
  adminNotes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.partnerApplication.findUnique({
      where: { id: input.applicationId },
      include: { partnerAccount: { include: { profile: true, user: true } } }
    });

    if (!application) {
      throw new Error("Application not found.");
    }

    if (input.decision === "reject") {
      const updated = await tx.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: PartnerApplicationStatus.REJECTED,
          adminNotes: input.adminNotes,
          reviewedAt: new Date(),
          reviewedById: input.adminUserId
        }
      });

      await createAuditLog(tx, {
        actorUserId: input.adminUserId,
        entityType: "PartnerApplication",
        entityId: application.id,
        action: "application.rejected",
        summary: `Application ${application.id} rejected`,
        previousState: { status: application.status },
        nextState: { status: updated.status }
      });

      await createAdminNotifications(tx, "Application closed", `${application.company} application rejected.`);

      await sendTransactionalEmail({
        to: application.email,
        subject: "Sugar & Leather AI partner application update",
        html: "<p>Thank you for applying. We are not moving forward at this time.</p>"
      });

      return updated;
    }

    if (!input.assignedTierId || !input.productId) {
      throw new Error("Tier and product are required when approving an application.");
    }

    const existingPartnerAccount =
      application.partnerAccount ??
      (await tx.partnerAccount.findUnique({
        where: { primaryContactEmail: application.email },
        include: { profile: true, user: true }
      }));

    const partnerAccount = existingPartnerAccount
      ? await tx.partnerAccount.update({
          where: { id: existingPartnerAccount.id },
          data: {
            applicationId: application.id,
            tierId: input.assignedTierId,
            company: application.company,
            primaryContactName: application.fullName,
            primaryContactEmail: application.email,
            affiliateId: existingPartnerAccount.affiliateId ?? (await generateUniqueAffiliateId(tx)),
            referredByVendorId: existingPartnerAccount.referredByVendorId ?? application.referredByVendorId,
            referralCodeUsed: existingPartnerAccount.referralCodeUsed ?? application.referralCodeUsed,
            phone: application.phone,
            country: application.country,
            status:
              existingPartnerAccount.status === PartnerAccountStatus.ACTIVE
                ? PartnerAccountStatus.ACTIVE
                : PartnerAccountStatus.INVITED
          },
          include: { profile: true, user: true }
        })
      : await tx.partnerAccount.create({
          data: {
            applicationId: application.id,
            tierId: input.assignedTierId,
            company: application.company,
            primaryContactName: application.fullName,
            primaryContactEmail: application.email,
            affiliateId: await generateUniqueAffiliateId(tx),
            referredByVendorId: application.referredByVendorId,
            referralCodeUsed: application.referralCodeUsed,
            phone: application.phone,
            country: application.country,
            status: PartnerAccountStatus.INVITED,
            profile: {
              create: {
                promotionChannels: application.promotionChannels,
                aiTechExperience: application.aiTechExperience,
                audienceDescription: application.audienceDescription
              }
            }
          },
          include: { profile: true, user: true }
        });

    if (partnerAccount.profile) {
      await tx.partnerProfile.update({
        where: { partnerAccountId: partnerAccount.id },
        data: {
          promotionChannels: application.promotionChannels,
          aiTechExperience: application.aiTechExperience,
          audienceDescription: application.audienceDescription
        }
      });
    } else {
      await tx.partnerProfile.create({
        data: {
          partnerAccountId: partnerAccount.id,
          promotionChannels: application.promotionChannels,
          aiTechExperience: application.aiTechExperience,
          audienceDescription: application.audienceDescription
        }
      });
    }

    const latestAgreementVersion = await tx.agreement.count({
      where: { partnerAccountId: partnerAccount.id }
    });

    const agreement =
      (await tx.agreement.findFirst({
        where: {
          partnerAccountId: partnerAccount.id,
          productId: input.productId,
          status: {
            in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE]
          }
        }
      })) ??
      (await tx.agreement.create({
        data: {
          partnerAccountId: partnerAccount.id,
          tierId: input.assignedTierId,
          productId: input.productId,
          name: "Partner Agreement",
          version: latestAgreementVersion + 1,
          status: AgreementStatus.DRAFT,
          effectiveStartDate: new Date()
        }
      }));

    const existingInvites = await tx.partnerInvite.findFirst({
      where: {
        partnerAccountId: partnerAccount.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    const shouldCreateInvite = !partnerAccount.user;
    const inviteToken = shouldCreateInvite ? existingInvites?.token ?? crypto.randomUUID() : undefined;
    if (shouldCreateInvite && !existingInvites && inviteToken) {
      await tx.partnerInvite.create({
        data: {
          partnerAccountId: partnerAccount.id,
          email: application.email,
          token: inviteToken,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
        }
      });
    }

    await tx.partnerApplication.update({
      where: { id: application.id },
      data: {
        status: PartnerApplicationStatus.APPROVED_PENDING_DOCUMENTS,
        assignedTierId: input.assignedTierId,
        productId: input.productId,
        adminNotes: input.adminNotes,
        reviewedAt: new Date(),
        reviewedById: input.adminUserId
      }
    });

    await ensureAgreementDocuments(tx, partnerAccount.id, agreement.id);

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "PartnerApplication",
      entityId: application.id,
      action: "application.approved",
      summary: `Application ${application.id} approved`,
      previousState: { status: application.status },
      nextState: { status: PartnerApplicationStatus.APPROVED_PENDING_DOCUMENTS }
    });

    await createPartnerNotification(
      tx,
      partnerAccount.id,
      "Application approved",
      shouldCreateInvite
        ? "Your application was approved. Set your password to continue onboarding."
        : "Your application was approved. Log in to continue onboarding.",
      shouldCreateInvite ? "/login/setup" : "/login"
    );

    await sendTransactionalEmail({
      to: application.email,
      subject: "Your Sugar & Leather AI partner application was approved",
      html: shouldCreateInvite && inviteToken
        ? `<p>Your application was approved. Set your password here: <a href="${buildInviteUrl(inviteToken)}">${buildInviteUrl(inviteToken)}</a></p>`
        : `<p>Your application was approved. Log in here to continue onboarding: <a href="${env.appBaseUrl}/login">${env.appBaseUrl}/login</a></p>`
    });

    return { partnerAccountId: partnerAccount.id, inviteToken };
  });
}

export async function sendAgreementDocuments(input: { partnerAccountId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId },
      include: {
        application: true,
        inviteTokens: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 1
        },
        agreements: {
          where: { status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] } },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!partner) {
      throw new Error("Partner not found.");
    }

    const agreement = partner.agreements[0];
    if (!agreement) {
      throw new Error("Agreement not found for partner.");
    }

    await ensureAgreementDocuments(tx, partner.id, agreement.id);

    await tx.partnerAccount.update({
      where: { id: partner.id },
      data: { status: PartnerAccountStatus.PENDING_DOCUMENTS }
    });

    await tx.partnerApplication.update({
      where: { id: partner.applicationId },
      data: { status: PartnerApplicationStatus.DOCUMENTS_SENT }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "PartnerAccount",
      entityId: partner.id,
      action: "documents.sent",
      summary: `Requested NDA and partner agreement from ${partner.company}`
    });

    await createPartnerNotification(
      tx,
      partner.id,
      "Documents requested",
      "We emailed your signed partner documents. No portal action is needed while admin reviews completion.",
      "/partner/dashboard"
    );

    const inviteUrl = partner.inviteTokens[0] ? buildInviteUrl(partner.inviteTokens[0].token) : `${env.appBaseUrl}/login`;
    await sendTransactionalEmail({
      to: partner.primaryContactEmail,
      subject: "Sugar & Leather AI documents ready for signature",
      html: `<p>Your signed partner documents have been emailed for completion. No portal action is needed right now. You can monitor your onboarding status here: <a href="${inviteUrl}">${inviteUrl}</a></p>`
    });
  });
}

export async function completePartnerInvite(input: {
  token: string;
  password: string;
}) {
  return prisma.$transaction(async (tx) => {
    const invite = await tx.partnerInvite.findUnique({
      where: { token: input.token },
      include: { partnerAccount: true }
    });

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new Error("Invite is invalid or expired.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const existingUser = await tx.user.findUnique({
      where: { email: invite.email }
    });

    if (existingUser) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          role: UserRole.PARTNER,
          partnerAccountId: invite.partnerAccountId,
          isActive: true
        }
      });
    } else {
      await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          name: invite.partnerAccount.primaryContactName,
          role: UserRole.PARTNER,
          partnerAccountId: invite.partnerAccountId
        }
      });
    }

    await tx.partnerInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() }
    });

    await createAuditLog(tx, {
      entityType: "PartnerInvite",
      entityId: invite.id,
      action: "invite.completed",
      summary: `Invite completed for ${invite.email}`
    });

    return invite.partnerAccountId;
  });
}

export async function uploadPartnerDocument(input: {
  partnerAccountId: string;
  type: AgreementDocumentType;
  file: File;
}) {
  const upload = await saveUploadedFile(input.file, `partner-documents/${input.partnerAccountId}`);

  return prisma.$transaction(async (tx) => {
    const document = await tx.agreementDocument.update({
      where: {
        partnerAccountId_type: {
          partnerAccountId: input.partnerAccountId,
          type: input.type
        }
      },
      data: {
        status: AgreementDocumentStatus.UPLOADED,
        fileName: upload.fileName,
        fileUrl: upload.relativePath,
        uploadedAt: new Date()
      }
    });

    const documents = await tx.agreementDocument.findMany({
      where: { partnerAccountId: input.partnerAccountId }
    });

    const allUploaded = documents.every(
      (item) => item.status === AgreementDocumentStatus.UPLOADED || item.status === AgreementDocumentStatus.VERIFIED
    );

    if (allUploaded) {
      const partner = await tx.partnerAccount.update({
        where: { id: input.partnerAccountId },
        data: { status: PartnerAccountStatus.PENDING_ACTIVATION }
      });

      await tx.partnerApplication.update({
        where: { id: partner.applicationId },
        data: { status: PartnerApplicationStatus.SIGNED_DOCUMENTS_UPLOADED }
      });
    }

    await createAuditLog(tx, {
      entityType: "AgreementDocument",
      entityId: document.id,
      action: "document.uploaded",
      summary: `${input.type} uploaded`,
      nextState: { status: document.status }
    });

    await createAdminNotifications(
      tx,
      "Signed documents uploaded",
      `A partner uploaded ${input.type}.`,
      "/admin/applications"
    );

    return document;
  });
}

export async function verifyPartnerDocument(input: {
  partnerAccountId: string;
  type: AgreementDocumentType;
  adminUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.agreementDocument.update({
      where: {
        partnerAccountId_type: {
          partnerAccountId: input.partnerAccountId,
          type: input.type
        }
      },
      data: {
        status: AgreementDocumentStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: input.adminUserId
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "AgreementDocument",
      entityId: document.id,
      action: "document.verified",
      summary: `${input.type} verified`,
      nextState: { status: document.status }
    });

    return document;
  });
}

export async function activatePartnerAccount(input: { partnerAccountId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId },
      include: {
        documents: true,
        user: true,
        agreements: {
          where: { status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] } },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!partner) {
      throw new Error("Partner not found.");
    }

    if (!partner.user) {
      throw new Error("Partner must set a password before activation.");
    }

    const allVerified = partner.documents.length >= 2 && partner.documents.every((document) => document.status === AgreementDocumentStatus.VERIFIED);
    if (!allVerified) {
      throw new Error("Both signed documents must be verified before activation.");
    }

    await tx.partnerAccount.update({
      where: { id: partner.id },
      data: {
        status: PartnerAccountStatus.ACTIVE,
        activatedAt: new Date()
      }
    });

    await tx.partnerApplication.update({
      where: { id: partner.applicationId },
      data: {
        status: PartnerApplicationStatus.ACTIVE,
        activatedAt: new Date()
      }
    });

    if (partner.agreements[0]) {
      await tx.agreement.update({
        where: { id: partner.agreements[0].id },
        data: { status: AgreementStatus.ACTIVE }
      });
    }

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "PartnerAccount",
      entityId: partner.id,
      action: "partner.activated",
      summary: `${partner.company} activated`
    });

    await createPartnerNotification(
      tx,
      partner.id,
      "Account activated",
      "Your partner account is active and you can submit referrals.",
      "/partner/dashboard"
    );

    await sendTransactionalEmail({
      to: partner.primaryContactEmail,
      subject: "Your Sugar & Leather AI partner account is active",
      html: "<p>Your partner account is now active.</p>"
    });
  });
}

export async function createReferral(input: {
  partnerAccountId: string;
  productId: string;
  packageId?: string;
  referredCompany: string;
  referredContactName: string;
  referredContactEmail?: string;
  referredDomain?: string;
  sourceNotes: string;
  useCaseSummary: string;
  estimatedDealValue?: number;
  attachment?: File | null;
}) {
  const normalizedKey = normalizeLeadKey({
    company: input.referredCompany,
    email: input.referredContactEmail,
    domain: input.referredDomain
  });

  const attachmentUpload =
    input.attachment && input.attachment.size
      ? await saveUploadedFile(input.attachment, `referral-attachments/${input.partnerAccountId}`)
      : null;

  return prisma.$transaction(async (tx) => {
    const existingAttributed = await tx.referral.findFirst({
      where: {
        normalizedLeadKey: normalizedKey,
        isAttributed: true
      }
    });

    const referralDecision = deriveReferralSubmissionStatus(Boolean(existingAttributed));

    const referral = await tx.referral.create({
      data: {
        partnerAccountId: input.partnerAccountId,
        productId: input.productId,
        packageId: input.packageId || null,
        referredCompany: input.referredCompany,
        referredContactName: input.referredContactName,
        referredContactEmail: input.referredContactEmail || null,
        referredDomain: input.referredDomain || null,
        normalizedLeadKey: normalizedKey,
        sourceNotes: input.sourceNotes,
        useCaseSummary: input.useCaseSummary,
        estimatedDealValue: input.estimatedDealValue ?? null,
        attachmentName: attachmentUpload?.fileName,
        attachmentUrl: attachmentUpload?.relativePath,
        isAttributed: referralDecision.isAttributed,
        status: referralDecision.status
      }
    });

    await createAuditLog(tx, {
      entityType: "Referral",
      entityId: referral.id,
      action: "referral.submitted",
      summary: `Referral submitted for ${referral.referredCompany}`,
      nextState: { status: referral.status, normalizedLeadKey: referral.normalizedLeadKey }
    });

    if (existingAttributed) {
      await createPartnerNotification(
        tx,
        input.partnerAccountId,
        "Referral received as duplicate",
        `${input.referredCompany} was already attributed to an earlier referral.`,
        "/partner/referrals"
      );

      await createAdminNotifications(
        tx,
        "Duplicate referral detected",
        `${input.referredCompany} was submitted as a duplicate referral.`,
        "/admin/referrals"
      );
    } else {
      await createAdminNotifications(
        tx,
        "Referral awaiting review",
        `${input.referredCompany} referral submitted and awaiting approval.`,
        "/admin/referrals"
      );
    }

    return referral;
  });
}

export async function reviewReferral(input: {
  referralId: string;
  adminUserId: string;
  decision: "approve" | "reject";
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({
      where: { id: input.referralId }
    });

    if (!referral) {
      throw new Error("Referral not found.");
    }

    if (referral.status === ReferralStatus.DUPLICATE_NOT_ATTRIBUTED) {
      throw new Error("Duplicate referrals cannot be approved.");
    }

    const nextStatus = input.decision === "approve" ? ReferralStatus.APPROVED : ReferralStatus.REJECTED;
    const updated = await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: nextStatus,
        reviewedById: input.adminUserId,
        approvedAt: input.decision === "approve" ? new Date() : null,
        reviewReason: input.reason
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "Referral",
      entityId: referral.id,
      action: `referral.${input.decision}d`,
      summary: `Referral ${input.decision}d`,
      previousState: { status: referral.status },
      nextState: { status: updated.status }
    });

    await createPartnerNotification(
      tx,
      referral.partnerAccountId,
      input.decision === "approve" ? "Referral approved" : "Referral rejected",
      input.decision === "approve"
        ? "Your referral is approved and can now progress to an active deal."
        : `Your referral was rejected.${input.reason ? ` Reason: ${input.reason}` : ""}`,
      "/partner/referrals"
    );

    return updated;
  });
}

async function generateCommissionLedgerEntries(tx: Prisma.TransactionClient, dealId: string) {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    include: {
      referral: true,
      partnerAccount: true
    }
  });

  if (!deal || deal.stage !== DealStage.CLOSED_WON || !deal.closedValue) {
    return;
  }

  const existingEntries = await tx.commissionLedgerEntry.count({
    where: { dealId }
  });

  if (existingEntries > 0) {
    return;
  }

  const agreement = await resolveActiveAgreement(deal.partnerAccountId, deal.productId, deal.packageId);
  const tierRule = await resolveTierRule(deal.partnerAccount.tierId, deal.productId, deal.packageId);

  const upfrontType = agreement.upfrontCommissionType ?? tierRule.upfrontCommissionType;
  const upfrontValue = agreement.upfrontCommissionValue ?? tierRule.upfrontCommissionValue;
  const trailingType = agreement.trailingCommissionType ?? tierRule.trailingCommissionType;
  const trailingValue = agreement.trailingCommissionValue ?? tierRule.trailingCommissionValue;
  const trailingDuration = agreement.trailingDurationMonths ?? tierRule.trailingDurationMonths ?? 0;
  const trailingCadence = agreement.trailingCadenceMonths ?? tierRule.trailingCadenceMonths ?? 0;

  const upfrontAmount = calculateCommissionAmount(Number(deal.closedValue), upfrontType!, Number(upfrontValue));
  await tx.commissionLedgerEntry.create({
    data: {
      partnerAccountId: deal.partnerAccountId,
      referralId: deal.referralId,
      dealId: deal.id,
      agreementId: agreement.id,
      type: CommissionEntryType.UPFRONT,
      status: CommissionLedgerStatus.APPROVED,
      amount: upfrontAmount,
      percentageApplied: upfrontType === CommissionType.PERCENTAGE ? upfrontValue : null,
      payableAt: new Date(),
      description: `Upfront commission for ${deal.referral.referredCompany}`
    }
  });

  if (trailingType && trailingValue && trailingDuration > 0 && trailingCadence > 0) {
    const periods = Math.floor(trailingDuration / trailingCadence);

    for (let index = 0; index < periods; index += 1) {
      const scheduledFor = new Date(deal.closeDate ?? new Date());
      scheduledFor.setMonth(scheduledFor.getMonth() + trailingCadence * (index + 1));

      const amount = calculateCommissionAmount(Number(deal.closedValue), trailingType, Number(trailingValue));
      await tx.commissionLedgerEntry.create({
        data: {
          partnerAccountId: deal.partnerAccountId,
          referralId: deal.referralId,
          dealId: deal.id,
          agreementId: agreement.id,
          type: CommissionEntryType.TRAILING,
          status: CommissionLedgerStatus.SCHEDULED,
          amount,
          percentageApplied: trailingType === CommissionType.PERCENTAGE ? trailingValue : null,
          scheduledFor,
          description: `Trailing commission ${index + 1}/${periods} for ${deal.referral.referredCompany}`
        }
      });
    }
  }
}

export async function upsertDeal(input: {
  adminUserId: string;
  referralId: string;
  ownerName: string;
  stage: DealStage;
  expectedValue?: number;
  closedValue?: number;
  closeDate?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({
      where: { id: input.referralId }
    });

    if (!referral) {
      throw new Error("Referral not found.");
    }

    if (referral.status !== ReferralStatus.APPROVED && referral.status !== ReferralStatus.CONVERTED && referral.status !== ReferralStatus.LOST) {
      throw new Error("Only approved referrals can be turned into deals.");
    }

    const deal = await tx.deal.upsert({
      where: { referralId: input.referralId },
      update: {
        ownerName: input.ownerName,
        stage: input.stage,
        expectedValue: input.expectedValue ?? null,
        closedValue: input.closedValue ?? null,
        closeDate: input.closeDate ? new Date(input.closeDate) : null,
        summaryNotes: input.notes
      },
      create: {
        referralId: input.referralId,
        partnerAccountId: referral.partnerAccountId,
        productId: referral.productId,
        packageId: referral.packageId,
        ownerName: input.ownerName,
        stage: input.stage,
        expectedValue: input.expectedValue ?? null,
        closedValue: input.closedValue ?? null,
        closeDate: input.closeDate ? new Date(input.closeDate) : null,
        summaryNotes: input.notes
      }
    });

    if (input.stage === DealStage.CLOSED_WON) {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: ReferralStatus.CONVERTED }
      });
      await generateCommissionLedgerEntries(tx, deal.id);
    } else if (input.stage === DealStage.CLOSED_LOST) {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: ReferralStatus.LOST }
      });
    }

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "Deal",
      entityId: deal.id,
      action: "deal.upserted",
      summary: `Deal ${deal.id} updated to ${deal.stage}`,
      nextState: { stage: deal.stage, closedValue: deal.closedValue?.toString() }
    });

    await createPartnerNotification(
      tx,
      referral.partnerAccountId,
      "Deal updated",
      `Deal for ${referral.referredCompany} is now ${deal.stage.replaceAll("_", " ").toLowerCase()}.`,
      "/partner/dashboard"
    );

    return deal;
  });
}

export async function updateCommissionStatus(input: {
  entryId: string;
  adminUserId: string;
  status: CommissionLedgerStatus;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.commissionLedgerEntry.findUnique({
      where: { id: input.entryId }
    });

    if (!existing) {
      throw new Error("Commission entry not found.");
    }

    const updated = await tx.commissionLedgerEntry.update({
      where: { id: input.entryId },
      data: {
        status: input.status,
        payableAt: input.status === CommissionLedgerStatus.PAYABLE ? new Date() : existing.payableAt,
        paidAt: input.status === CommissionLedgerStatus.PAID ? new Date() : existing.paidAt
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "CommissionLedgerEntry",
      entityId: existing.id,
      action: "commission.status_changed",
      summary: `Commission status changed from ${existing.status} to ${updated.status}`,
      previousState: { status: existing.status },
      nextState: { status: updated.status }
    });

    return updated;
  });
}

export async function createCommissionEntry(input: {
  adminUserId: string;
  partnerAccountId: string;
  type: CommissionEntryType;
  amount: number;
  status?: CommissionLedgerStatus;
  description: string;
  referralId?: string | null;
  scheduledFor?: Date | null;
}) {
  if (!Number.isFinite(input.amount)) {
    throw new Error("Amount must be a number.");
  }
  if (input.type === CommissionEntryType.CLAWBACK) {
    throw new Error("Use the clawback flow to create clawbacks.");
  }

  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId }
    });
    if (!partner) {
      throw new Error("Partner not found.");
    }

    const agreement = await tx.agreement.findFirst({
      where: {
        partnerAccountId: input.partnerAccountId,
        status: { in: [AgreementStatus.ACTIVE, AgreementStatus.DRAFT] }
      },
      orderBy: [{ effectiveStartDate: "desc" }, { version: "desc" }]
    });
    if (!agreement) {
      throw new Error("Partner has no active agreement.");
    }

    const status = input.status ?? CommissionLedgerStatus.APPROVED;

    const entry = await tx.commissionLedgerEntry.create({
      data: {
        partnerAccountId: input.partnerAccountId,
        agreementId: agreement.id,
        referralId: input.referralId ?? null,
        type: input.type,
        status,
        amount: input.amount,
        description: input.description,
        scheduledFor: input.scheduledFor ?? null,
        payableAt: status === CommissionLedgerStatus.PAYABLE ? new Date() : null,
        paidAt: status === CommissionLedgerStatus.PAID ? new Date() : null
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "CommissionLedgerEntry",
      entityId: entry.id,
      action: "commission.manual_entry_created",
      summary: `Manual ${input.type.toLowerCase()} commission for ${partner.company}`,
      nextState: { amount: entry.amount.toString(), status }
    });

    return entry;
  });
}

export async function createClawback(input: {
  adminUserId: string;
  entryId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.commissionLedgerEntry.findUnique({
      where: { id: input.entryId }
    });

    if (!entry) {
      throw new Error("Commission entry not found.");
    }

    const clawback = await tx.commissionLedgerEntry.create({
      data: {
        partnerAccountId: entry.partnerAccountId,
        referralId: entry.referralId,
        dealId: entry.dealId,
        agreementId: entry.agreementId,
        parentEntryId: entry.id,
        type: CommissionEntryType.CLAWBACK,
        status: CommissionLedgerStatus.CLAWED_BACK,
        amount: Number(entry.amount) * -1,
        description: `Clawback: ${input.reason}`
      }
    });

    if (entry.referralId) {
      await tx.referral.update({
        where: { id: entry.referralId },
        data: { status: ReferralStatus.CLAWED_BACK }
      });
    }

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "CommissionLedgerEntry",
      entityId: clawback.id,
      action: "commission.clawback_created",
      summary: `Clawback created for entry ${entry.id}`,
      nextState: { amount: clawback.amount.toString() }
    });

    return clawback;
  });
}

export async function getStripeOnboardingLink(partnerAccountId: string) {
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId }
  });

  if (!partner) {
    throw new Error("Partner not found.");
  }

  let stripeAccountId = partner.stripeAccountId;
  if (!stripeAccountId) {
    const provisioned = await provisionConnectAccount(partner.primaryContactEmail, partner.company);
    stripeAccountId = provisioned.accountId;

    await prisma.partnerAccount.update({
      where: { id: partner.id },
      data: { stripeAccountId }
    });
  }

  return createConnectOnboardingLink(stripeAccountId);
}

export async function markStripeOnboardingComplete(partnerAccountId: string) {
  return prisma.partnerAccount.update({
    where: { id: partnerAccountId },
    data: { stripeOnboardingComplete: true }
  });
}

export async function createPayoutBatch(input: {
  adminUserId: string;
  partnerAccountId: string;
  entryIds: string[];
  label: string;
}) {
  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: input.partnerAccountId }
    });

    if (!partner) {
      throw new Error("Partner not found.");
    }

    if (!partner.stripeOnboardingComplete) {
      throw new Error("Partner must complete Stripe onboarding before payout.");
    }

    const batch = await tx.payoutBatch.create({
      data: {
        partnerAccountId: input.partnerAccountId,
        label: input.label,
        status: PayoutBatchStatus.READY,
        scheduledAt: new Date()
      }
    });

    await tx.commissionLedgerEntry.updateMany({
      where: {
        id: { in: input.entryIds },
        partnerAccountId: input.partnerAccountId
      },
      data: {
        payoutBatchId: batch.id,
        status: CommissionLedgerStatus.PAYABLE,
        payableAt: new Date()
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "PayoutBatch",
      entityId: batch.id,
      action: "payout_batch.created",
      summary: `Payout batch ${input.label} created`
    });

    return batch;
  });
}

export async function markPayoutBatchPaid(input: {
  adminUserId: string;
  batchId: string;
  stripePayoutId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.payoutBatch.update({
      where: { id: input.batchId },
      data: {
        status: PayoutBatchStatus.PAID,
        submittedAt: new Date(),
        paidAt: new Date(),
        stripePayoutId: input.stripePayoutId
      }
    });

    const entries = await tx.commissionLedgerEntry.findMany({
      where: { payoutBatchId: batch.id }
    });

    await tx.commissionLedgerEntry.updateMany({
      where: { payoutBatchId: batch.id },
      data: {
        status: CommissionLedgerStatus.PAID,
        paidAt: new Date(),
        stripePayoutId: input.stripePayoutId
      }
    });

    await createAuditLog(tx, {
      actorUserId: input.adminUserId,
      entityType: "PayoutBatch",
      entityId: batch.id,
      action: "payout_batch.paid",
      summary: `Payout batch ${batch.label} marked paid`,
      nextState: { stripePayoutId: input.stripePayoutId }
    });

    await createPartnerNotification(
      tx,
      batch.partnerAccountId,
      "Payout sent",
      `Your payout batch ${batch.label} has been marked paid for ${entries.length} commission entries.`,
      "/partner/earnings"
    );

    return batch;
  });
}

export async function refreshQuarterlyActivity(partnerAccountId: string, date = new Date()) {
  const year = date.getUTCFullYear();
  const quarter = getQuarter(date);
  const periodStart = startOfQuarter(year, quarter);
  const periodEnd = endOfQuarter(year, quarter);

  return prisma.$transaction(async (tx) => {
    const partner = await tx.partnerAccount.findUnique({
      where: { id: partnerAccountId }
    });

    if (!partner) {
      throw new Error("Partner not found.");
    }

    const tierRule = await resolveTierRule(partner.tierId, (await tx.referral.findFirst({ where: { partnerAccountId }, select: { productId: true } }))?.productId ?? (await tx.product.findFirstOrThrow()).id);

    const [approvedReferrals, convertedDeals, revenueAggregate, commissionAggregate] = await Promise.all([
      tx.referral.count({
        where: {
          partnerAccountId,
          status: { in: [ReferralStatus.APPROVED, ReferralStatus.CONVERTED] },
          approvedAt: { gte: periodStart, lte: periodEnd }
        }
      }),
      tx.deal.count({
        where: {
          partnerAccountId,
          stage: DealStage.CLOSED_WON,
          closeDate: { gte: periodStart, lte: periodEnd }
        }
      }),
      tx.deal.aggregate({
        where: {
          partnerAccountId,
          stage: DealStage.CLOSED_WON,
          closeDate: { gte: periodStart, lte: periodEnd }
        },
        _sum: {
          closedValue: true
        }
      }),
      tx.commissionLedgerEntry.aggregate({
        where: {
          partnerAccountId,
          createdAt: { gte: periodStart, lte: periodEnd },
          status: { not: CommissionLedgerStatus.VOID }
        },
        _sum: {
          amount: true
        }
      })
    ]);

    const revenueAmount = Number(revenueAggregate._sum.closedValue ?? 0);
    const commissionAmount = Number(commissionAggregate._sum.amount ?? 0);

    const meetsThreshold = evaluateQuarterlyActivity(
      {
        approvedReferrals,
        convertedDeals,
        revenueAmount,
        commissionAmount
      },
      {
        quarterlyApprovedReferralsMin: tierRule.quarterlyApprovedReferralsMin,
        quarterlyConvertedDealsMin: tierRule.quarterlyConvertedDealsMin,
        quarterlyRevenueMin: Number(tierRule.quarterlyRevenueMin ?? 0),
        quarterlyCommissionMin: Number(tierRule.quarterlyCommissionMin ?? 0)
      }
    );

    const snapshot = await tx.quarterlyActivitySnapshot.upsert({
      where: {
        partnerAccountId_year_quarter: {
          partnerAccountId,
          year,
          quarter
        }
      },
      update: {
        approvedReferrals,
        convertedDeals,
        revenueAmount,
        commissionAmount,
        status: meetsThreshold ? QuarterlyActivityStatus.MET_THRESHOLD : QuarterlyActivityStatus.BELOW_THRESHOLD,
        computedAt: new Date()
      },
      create: {
        partnerAccountId,
        tierId: partner.tierId,
        year,
        quarter,
        approvedReferrals,
        convertedDeals,
        revenueAmount,
        commissionAmount,
        status: meetsThreshold ? QuarterlyActivityStatus.MET_THRESHOLD : QuarterlyActivityStatus.BELOW_THRESHOLD
      }
    });

    if (!meetsThreshold) {
      await createPartnerNotification(
        tx,
        partnerAccountId,
        "Quarterly activity warning",
        "Your current quarter is below the current program activity threshold.",
        "/partner/activity"
      );

      await createAdminNotifications(
        tx,
        "Quarterly activity flag",
        `${partner.company} is below the current program activity threshold.`,
        "/admin/partners"
      );
    }

    return snapshot;
  });
}

export async function createTierWithRule(input: {
  name: string;
  description?: string;
  productId?: string;
  packageId?: string;
  upfrontCommissionType: CommissionType;
  upfrontCommissionValue: number;
  trailingCommissionType?: CommissionType;
  trailingCommissionValue?: number;
  trailingDurationMonths?: number;
  trailingCadenceMonths?: number;
  clawbackWindowDays?: number;
  quarterlyApprovedReferralsMin?: number;
  quarterlyConvertedDealsMin?: number;
  quarterlyRevenueMin?: number;
  quarterlyCommissionMin?: number;
}) {
  return prisma.tier.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      rules: {
        create: {
          productId: input.productId || null,
          packageId: input.packageId || null,
          upfrontCommissionType: input.upfrontCommissionType,
          upfrontCommissionValue: input.upfrontCommissionValue,
          trailingCommissionType: input.trailingCommissionType,
          trailingCommissionValue: input.trailingCommissionValue,
          trailingDurationMonths: input.trailingDurationMonths,
          trailingCadenceMonths: input.trailingCadenceMonths,
          clawbackWindowDays: input.clawbackWindowDays,
          quarterlyApprovedReferralsMin: input.quarterlyApprovedReferralsMin,
          quarterlyConvertedDealsMin: input.quarterlyConvertedDealsMin,
          quarterlyRevenueMin: input.quarterlyRevenueMin,
          quarterlyCommissionMin: input.quarterlyCommissionMin
        }
      }
    }
  });
}

export async function recordAriesAffiliateSignup(input: {
  refCode: string;
  name: string;
  email: string;
  company?: string | null;
  domain?: string | null;
  packageSlug?: string | null;
  notes?: string | null;
}) {
  const refCode = input.refCode.trim();
  if (!refCode) {
    throw new Error("Missing referral code.");
  }

  const partner = await prisma.partnerAccount.findUnique({
    where: { vendorReferralCode: refCode }
  });

  if (!partner || !partner.vendorReferralCodeActive) {
    throw new Error("Referral code not recognized.");
  }

  if (partner.status !== PartnerAccountStatus.ACTIVE) {
    throw new Error("Partner is not active.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  if (partner.primaryContactEmail.toLowerCase() === normalizedEmail) {
    throw new Error("Self-referrals are not allowed.");
  }

  const product = await prisma.product.findUnique({ where: { slug: "aries-ai" } });
  if (!product) {
    throw new Error("Aries product not configured.");
  }

  const pkg = input.packageSlug
    ? await prisma.package.findFirst({
        where: { productId: product.id, slug: input.packageSlug }
      })
    : null;

  const company = (input.company?.trim() || input.name.trim());
  const normalizedKey = normalizeLeadKey({
    company,
    email: input.email,
    domain: input.domain ?? null
  });

  return prisma.$transaction(async (tx) => {
    const existingForEmail = await tx.referral.findFirst({
      where: { referredContactEmail: normalizedEmail },
      orderBy: { createdAt: "asc" }
    });

    if (existingForEmail) {
      return {
        referral: existingForEmail,
        partnerAccountId: existingForEmail.partnerAccountId,
        alreadyRecorded: true as const
      };
    }

    const existingAttributed = await tx.referral.findFirst({
      where: { normalizedLeadKey: normalizedKey, isAttributed: true }
    });

    const decision = deriveReferralSubmissionStatus(Boolean(existingAttributed));

    const referral = await tx.referral.create({
      data: {
        partnerAccountId: partner.id,
        productId: product.id,
        packageId: pkg?.id ?? null,
        referredCompany: company,
        referredContactName: input.name.trim(),
        referredContactEmail: normalizedEmail,
        referredDomain: input.domain?.trim().toLowerCase() ?? null,
        normalizedLeadKey: normalizedKey,
        sourceNotes: input.notes?.trim() || `Aries signup via referral link (${refCode})`,
        useCaseSummary: "Aries affiliate signup",
        isAttributed: decision.isAttributed,
        status: decision.status
      }
    });

    await createAuditLog(tx, {
      entityType: "Referral",
      entityId: referral.id,
      action: "referral.aries_signup",
      summary: `Aries signup ${input.email} attributed to ${partner.company}`,
      nextState: { status: referral.status, refCode, normalizedLeadKey: normalizedKey }
    });

    await createPartnerNotification(
      tx,
      partner.id,
      existingAttributed ? "Aries signup received as duplicate" : "New Aries signup via your referral link",
      `${input.email} signed up using your referral code.`,
      "/partner/referrals"
    );

    return { referral, partnerAccountId: partner.id, alreadyRecorded: false as const };
  });
}
