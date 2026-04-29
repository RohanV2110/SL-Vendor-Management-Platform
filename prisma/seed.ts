import bcrypt from "bcryptjs";
import { PrismaClient, CommissionType, UserRole, PartnerApplicationStatus, PartnerAccountStatus, AgreementStatus, AgreementDocumentType, AgreementDocumentStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@sugarleather.ai" },
    update: {},
    create: {
      email: "admin@sugarleather.ai",
      passwordHash,
      name: "Sugar & Leather Admin",
      role: UserRole.ADMIN
    }
  });

  const product = await prisma.product.upsert({
    where: { slug: "aries-ai" },
    update: {},
    create: {
      name: "Aries AI",
      slug: "aries-ai",
      description: "Seed product for the partner program MVP."
    }
  });

  const pkg = await prisma.package.upsert({
    where: {
      productId_slug: {
        productId: product.id,
        slug: "core-platform"
      }
    },
    update: {},
    create: {
      productId: product.id,
      name: "Core Platform",
      slug: "core-platform",
      description: "Initial Aries AI package."
    }
  });

  const affiliateTier = await prisma.tier.upsert({
    where: { slug: "affiliate" },
    update: {},
    create: {
      name: "Affiliate",
      slug: "affiliate",
      description: "Baseline affiliate tier.",
      isDefault: true
    }
  });

  const resellerTier = await prisma.tier.upsert({
    where: { slug: "authorized-reseller" },
    update: {},
    create: {
      name: "Authorized Reseller",
      slug: "authorized-reseller",
      description: "Baseline reseller tier.",
      isDefault: true
    }
  });

  await prisma.tierRule.upsert({
    where: { id: "affiliate-default-rule" },
    update: {},
    create: {
      id: "affiliate-default-rule",
      tierId: affiliateTier.id,
      productId: product.id,
      packageId: pkg.id,
      upfrontCommissionType: CommissionType.PERCENTAGE,
      upfrontCommissionValue: 10,
      trailingCommissionType: CommissionType.PERCENTAGE,
      trailingCommissionValue: 5,
      trailingDurationMonths: 12,
      trailingCadenceMonths: 3,
      clawbackWindowDays: 60,
      quarterlyApprovedReferralsMin: 1,
      quarterlyConvertedDealsMin: 0,
      quarterlyRevenueMin: 0,
      quarterlyCommissionMin: 0
    }
  });

  await prisma.tierRule.upsert({
    where: { id: "reseller-default-rule" },
    update: {},
    create: {
      id: "reseller-default-rule",
      tierId: resellerTier.id,
      productId: product.id,
      packageId: pkg.id,
      upfrontCommissionType: CommissionType.PERCENTAGE,
      upfrontCommissionValue: 20,
      trailingCommissionType: CommissionType.PERCENTAGE,
      trailingCommissionValue: 10,
      trailingDurationMonths: 12,
      trailingCadenceMonths: 3,
      clawbackWindowDays: 90,
      quarterlyApprovedReferralsMin: 2,
      quarterlyConvertedDealsMin: 1,
      quarterlyRevenueMin: 10000,
      quarterlyCommissionMin: 1000
    }
  });

  const prompts = [
    {
      label: "Why do you want to partner with Sugar & Leather AI?",
      helperText: "Tell us what makes this program a fit.",
      sortOrder: 1
    },
    {
      label: "How would you position Aries AI to your audience?",
      helperText: "Explain the angle or messaging you would lead with.",
      sortOrder: 2
    },
    {
      label: "Describe a recent AI or tech product you successfully promoted or sold.",
      helperText: "Share concrete experience and outcomes.",
      sortOrder: 3
    }
  ];

  for (const prompt of prompts) {
    await prisma.questionPrompt.upsert({
      where: {
        id: `seed-${prompt.sortOrder}`
      },
      update: {
        label: prompt.label,
        helperText: prompt.helperText,
        productId: product.id
      },
      create: {
        id: `seed-${prompt.sortOrder}`,
        productId: product.id,
        label: prompt.label,
        helperText: prompt.helperText,
        sortOrder: prompt.sortOrder
      }
    });
  }

  const sampleApplication = await prisma.partnerApplication.upsert({
    where: { id: "sample-application" },
    update: {},
    create: {
      id: "sample-application",
      fullName: "Jordan Miles",
      email: "jordan@example.com",
      phone: "+1-415-555-0101",
      company: "Signal Forge",
      country: "United States",
      promotionChannels: "Newsletter, LinkedIn, webinars",
      aiTechExperience: "5 years selling AI enablement services.",
      audienceDescription: "Mid-market RevOps leaders and founders.",
      status: PartnerApplicationStatus.DOCUMENTS_SENT,
      productId: product.id,
      assignedTierId: affiliateTier.id,
      reviewedById: admin.id
    }
  });

  const partner = await prisma.partnerAccount.upsert({
    where: { applicationId: sampleApplication.id },
    update: {},
    create: {
      applicationId: sampleApplication.id,
      tierId: affiliateTier.id,
      company: sampleApplication.company,
      primaryContactName: sampleApplication.fullName,
      primaryContactEmail: sampleApplication.email,
      phone: sampleApplication.phone,
      country: sampleApplication.country,
      status: PartnerAccountStatus.PENDING_DOCUMENTS
    }
  });

  await prisma.partnerProfile.upsert({
    where: { partnerAccountId: partner.id },
    update: {},
    create: {
      partnerAccountId: partner.id,
      promotionChannels: sampleApplication.promotionChannels,
      aiTechExperience: sampleApplication.aiTechExperience,
      audienceDescription: sampleApplication.audienceDescription
    }
  });

  await prisma.agreement.upsert({
    where: { id: "sample-agreement" },
    update: {},
    create: {
      id: "sample-agreement",
      partnerAccountId: partner.id,
      tierId: affiliateTier.id,
      productId: product.id,
      packageId: pkg.id,
      name: "Aries AI Affiliate Agreement",
      version: 1,
      status: AgreementStatus.ACTIVE,
      effectiveStartDate: new Date()
    }
  });

  for (const type of [AgreementDocumentType.NDA, AgreementDocumentType.PARTNER_AGREEMENT]) {
    await prisma.agreementDocument.upsert({
      where: {
        partnerAccountId_type: {
          partnerAccountId: partner.id,
          type
        }
      },
      update: {},
      create: {
        partnerAccountId: partner.id,
        agreementId: "sample-agreement",
        type,
        status: AgreementDocumentStatus.REQUESTED
      }
    });
  }

  console.log("Seeded admin user:", admin.email, "password: Admin123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
