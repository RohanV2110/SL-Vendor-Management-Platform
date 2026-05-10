import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { VendorReferralCard } from "@/components/vendor-referral-card";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function PartnerDashboardPage() {
  const partnerId = await requirePartnerAccountId();
  const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

  const [partner, totalAffiliates, newAffiliates7, newAffiliates30, recentAffiliates] =
    await Promise.all([
      prisma.partnerAccount.findUnique({
        where: { id: partnerId },
        select: {
          id: true,
          vendorReferralCode: true,
          vendorReferralCodeActive: true,
          stripeOnboardingComplete: true,
          status: true
        }
      }),
      prisma.partnerAccount.count({ where: { referredByVendorId: partnerId } }),
      prisma.partnerAccount.count({
        where: {
          referredByVendorId: partnerId,
          createdAt: { gte: sevenDaysAgo }
        }
      }),
      prisma.partnerAccount.count({
        where: {
          referredByVendorId: partnerId,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.partnerAccount.findMany({
        where: { referredByVendorId: partnerId },
        select: {
          id: true,
          affiliateId: true,
          primaryContactName: true,
          primaryContactEmail: true,
          createdAt: true,
          status: true
        },
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

  if (!partner) {
    redirect("/apply");
  }

  const isActive = partner.status === "ACTIVE";

  return (
    <div className="stack-lg">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Partner Dashboard</p>
          <h1>Referral growth overview</h1>
          <p className="lead">
            Generate Aries AI referral links, view linked affiliates, and monitor partner activity.
          </p>
        </div>
        <Link className="button" href="/partner/affiliates">
          View Affiliates
        </Link>
      </section>

      <div className="stats-grid">
        <div className="stat">
          <span className="muted">Total Affiliates</span>
          <strong>{totalAffiliates}</strong>
        </div>
        <div className="stat">
          <span className="muted">New Affiliates</span>
          <strong>{newAffiliates7}</strong>
          <small className="muted">Last 7 days</small>
        </div>
        <div className="stat">
          <span className="muted">30 Day Growth</span>
          <strong>{newAffiliates30}</strong>
        </div>
        <div className="stat">
          <span className="muted">Payout</span>
          <strong>{partner.stripeOnboardingComplete ? "Ready" : "Pending"}</strong>
        </div>
      </div>

      <div className="stack-lg">
        <VendorReferralCard
          partnerAccountId={partner.id}
          vendorReferralCode={partner.vendorReferralCode}
          vendorReferralCodeActive={partner.vendorReferralCodeActive}
          disabled={!isActive}
        />

        <SectionCard
          title="Recent Affiliates"
          eyebrow="Latest signups"
          action={
            <Link className="button button-secondary table-action-button" href="/partner/affiliates">
              View All
            </Link>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th>Email</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentAffiliates.map((affiliate) => (
                  <tr key={affiliate.id}>
                    <td>
                      <strong>{affiliate.primaryContactName}</strong>
                      <br />
                      <span className="muted">{affiliate.affiliateId ?? affiliate.primaryContactEmail}</span>
                    </td>
                    <td>{affiliate.primaryContactEmail}</td>
                    <td>{formatDateTime(affiliate.createdAt)}</td>
                  </tr>
                ))}
                {!recentAffiliates.length ? (
                  <tr>
                    <td colSpan={3}>No affiliates yet. Generate your referral link and share it with your network.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
