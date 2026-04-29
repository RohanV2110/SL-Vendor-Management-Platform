import { z } from "zod";

export const applicationSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional().default(""),
  company: z.string().optional().default(""),
  country: z.string().optional().default(""),
  promotionChannels: z.string().optional().default(""),
  aiTechExperience: z.string().optional().default(""),
  audienceDescription: z.string().optional().default(""),
  productId: z.string().optional(),
  answers: z.array(
    z.object({
      questionPromptId: z.string().min(1),
      response: z.string()
    })
  )
});

export const referralSchema = z.object({
  productId: z.string().min(1),
  packageId: z.string().optional(),
  referredCompany: z.string().min(2),
  referredContactName: z.string().min(2),
  referredContactEmail: z.string().email().optional().or(z.literal("")),
  referredDomain: z.string().optional(),
  sourceNotes: z.string().min(10),
  useCaseSummary: z.string().min(10),
  estimatedDealValue: z.coerce.number().nonnegative().optional()
});

export const reviewApplicationSchema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  assignedTierId: z.string().optional(),
  productId: z.string().optional(),
  adminNotes: z.string().optional()
});

export const referralReviewSchema = z.object({
  referralId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional()
});

export const dealSchema = z.object({
  referralId: z.string().min(1),
  ownerName: z.string().min(2),
  stage: z.enum(["NEW", "QUALIFYING", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]),
  expectedValue: z.coerce.number().nonnegative().optional(),
  closedValue: z.coerce.number().nonnegative().optional(),
  closeDate: z.string().optional(),
  notes: z.string().optional()
});

export const tierSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  productId: z.string().optional(),
  packageId: z.string().optional(),
  upfrontCommissionType: z.enum(["PERCENTAGE", "FIXED"]),
  upfrontCommissionValue: z.coerce.number().nonnegative(),
  trailingCommissionType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  trailingCommissionValue: z.coerce.number().nonnegative().optional(),
  trailingDurationMonths: z.coerce.number().int().nonnegative().optional(),
  trailingCadenceMonths: z.coerce.number().int().positive().optional(),
  clawbackWindowDays: z.coerce.number().int().nonnegative().optional(),
  quarterlyApprovedReferralsMin: z.coerce.number().int().nonnegative().optional(),
  quarterlyConvertedDealsMin: z.coerce.number().int().nonnegative().optional(),
  quarterlyRevenueMin: z.coerce.number().nonnegative().optional(),
  quarterlyCommissionMin: z.coerce.number().nonnegative().optional()
});

export const payoutBatchSchema = z.object({
  partnerAccountId: z.string().min(1),
  entryIds: z.array(z.string().min(1)).min(1),
  label: z.string().min(2)
});
