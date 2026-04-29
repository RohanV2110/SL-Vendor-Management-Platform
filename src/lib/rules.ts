export type CommissionKind = "PERCENTAGE" | "FIXED";
export type DerivedReferralStatus = "SUBMITTED" | "DUPLICATE_NOT_ATTRIBUTED";

export function deriveReferralSubmissionStatus(hasExistingAttributedReferral: boolean) {
  return {
    isAttributed: !hasExistingAttributedReferral,
    status: (hasExistingAttributedReferral ? "DUPLICATE_NOT_ATTRIBUTED" : "SUBMITTED") as DerivedReferralStatus
  };
}

export function calculateCommissionAmount(closedValue: number, type: CommissionKind, value: number) {
  if (type === "FIXED") {
    return value;
  }

  return (closedValue * value) / 100;
}

export function evaluateQuarterlyActivity(
  metrics: {
    approvedReferrals: number;
    convertedDeals: number;
    revenueAmount: number;
    commissionAmount: number;
  },
  thresholds: {
    quarterlyApprovedReferralsMin?: number | null;
    quarterlyConvertedDealsMin?: number | null;
    quarterlyRevenueMin?: number | null;
    quarterlyCommissionMin?: number | null;
  }
) {
  return (
    metrics.approvedReferrals >= (thresholds.quarterlyApprovedReferralsMin ?? 0) &&
    metrics.convertedDeals >= (thresholds.quarterlyConvertedDealsMin ?? 0) &&
    metrics.revenueAmount >= (thresholds.quarterlyRevenueMin ?? 0) &&
    metrics.commissionAmount >= (thresholds.quarterlyCommissionMin ?? 0)
  );
}
