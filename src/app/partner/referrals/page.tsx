import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { VendorReferralCard } from "@/components/vendor-referral-card";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function PartnerReferralsPage() {
  const partnerId = await requirePartnerAccountId();
  const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

  const [partner, totalAffiliates, newAffiliates30, ariesReferrals] = await Promise.all([
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
    }),
    prisma.referral.findMany({
      where: {
        partnerAccountId: partnerId,
        product: { slug: "aries-ai" }
      },
      select: {
        id: true,
        referredContactName: true,
        referredContactEmail: true,
        createdAt: true,
        status: true,
        isAttributed: true
      },
      orderBy: { createdAt: "desc" },
      take: 25
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

      <SectionCard title="Aries Signups" eyebrow="Users referred via your link">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Signup Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ariesReferrals.map((referral) => (
                <tr key={referral.id}>
                  <td>{referral.referredContactName}</td>
                  <td>{referral.referredContactEmail}</td>
                  <td>{formatDateTime(referral.createdAt)}</td>
                  <td>
                    {referral.isAttributed
                      ? referral.status.toLowerCase().replaceAll("_", " ")
                      : "duplicate"}
                  </td>
                </tr>
              ))}
              {!ariesReferrals.length ? (
                <tr>
                  <td colSpan={4}>
                    No Aries signups yet. Share your referral link to start tracking.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
