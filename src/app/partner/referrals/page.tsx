import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerAccountStatus } from "@prisma/client";
import { SectionCard } from "@/components/section-card";
import { VendorReferralCard } from "@/components/vendor-referral-card";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export default async function PartnerReferralsPage() {
  const partnerId = await requirePartnerAccountId();

  const [partner, totalAffiliates, activeAffiliates, inactiveAffiliates] = await Promise.all([
    prisma.partnerAccount.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        vendorReferralCode: true,
        vendorReferralCodeActive: true
      }
    }),
    prisma.partnerAccount.count({ where: { referredByVendorId: partnerId } }),
    prisma.partnerAccount.count({
      where: {
        referredByVendorId: partnerId,
        status: PartnerAccountStatus.ACTIVE
      }
    }),
    prisma.partnerAccount.count({
      where: {
        referredByVendorId: partnerId,
        status: { not: PartnerAccountStatus.ACTIVE }
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
            <span className="muted">Active Affiliates</span>
            <strong>{activeAffiliates}</strong>
          </div>
          <div className="metric-card">
            <span className="muted">Inactive Affiliates</span>
            <strong>{inactiveAffiliates}</strong>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
