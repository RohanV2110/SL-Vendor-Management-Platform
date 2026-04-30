import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { VendorReferralCard } from "@/components/vendor-referral-card";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export default async function PartnerReferralsPage() {
  const partnerId = await requirePartnerAccountId();
  const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

  const [partner, totalAffiliates, newAffiliates30] = await Promise.all([
    prisma.partnerAccount.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        vendorReferralCode: true,
        vendorReferralCodeActive: true,
        referralClicks: true
      }
    }),
    prisma.partnerAccount.count({ where: { referredByVendorId: partnerId } }),
    prisma.partnerAccount.count({
      where: {
        referredByVendorId: partnerId,
        createdAt: { gte: thirtyDaysAgo }
      }
    })
  ]);

  if (!partner) {
    redirect("/apply");
  }

  return (
    <div className="stack-lg">
      <VendorReferralCard
        partnerAccountId={partner.id}
        vendorReferralCode={partner.vendorReferralCode}
        vendorReferralCodeActive={partner.vendorReferralCodeActive}
      />

      <SectionCard
        title="Affiliate Overview"
        eyebrow="Partner referral performance"
        action={
          <Link className="button button-secondary" href="/partner/affiliates">
            View Affiliates
          </Link>
        }
      >
        <div className="three-col">
          <div className="metric-card">
            <span className="muted">Total Affiliates</span>
            <strong>{totalAffiliates}</strong>
          </div>
          <div className="metric-card">
            <span className="muted">New Affiliates</span>
            <strong>{newAffiliates30}</strong>
          </div>
          <div className="metric-card">
            <span className="muted">Referral Clicks</span>
            <strong>{partner.referralClicks}</strong>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
