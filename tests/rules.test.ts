import { describe, expect, it } from "vitest";
import { calculateCommissionAmount, deriveReferralSubmissionStatus, evaluateQuarterlyActivity } from "@/lib/rules";
import { normalizeLeadKey } from "@/lib/utils";

describe("partner platform rules", () => {
  it("uses first-attribution for new referrals", () => {
    expect(deriveReferralSubmissionStatus(false)).toEqual({
      isAttributed: true,
      status: "SUBMITTED"
    });

    expect(deriveReferralSubmissionStatus(true)).toEqual({
      isAttributed: false,
      status: "DUPLICATE_NOT_ATTRIBUTED"
    });
  });

  it("normalizes lead keys by domain before company name", () => {
    expect(
      normalizeLeadKey({
        company: "Acme Ventures",
        email: "buyer@acme.com",
        domain: "https://www.acme.com"
      })
    ).toBe("domain:acme.com");
  });

  it("calculates percentage and fixed commissions", () => {
    expect(calculateCommissionAmount(12000, "PERCENTAGE", 10)).toBe(1200);
    expect(calculateCommissionAmount(12000, "FIXED", 750)).toBe(750);
  });

  it("flags a quarter below threshold when any metric misses", () => {
    expect(
      evaluateQuarterlyActivity(
        {
          approvedReferrals: 2,
          convertedDeals: 0,
          revenueAmount: 15000,
          commissionAmount: 2500
        },
        {
          quarterlyApprovedReferralsMin: 2,
          quarterlyConvertedDealsMin: 1,
          quarterlyRevenueMin: 10000,
          quarterlyCommissionMin: 1000
        }
      )
    ).toBe(false);
  });
});
