import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { CommissionLedgerStatus } from "@prisma/client";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function PartnerDashboardPage() {
  const user = await requireRole("PARTNER");
  const partnerId = user.partnerAccountId!;

  const [partner, referrals, deals, ledger, notifications] = await Promise.all([
    prisma.partnerAccount.findUniqueOrThrow({
      where: { id: partnerId },
      select: {
        status: true,
        stripeOnboardingComplete: true
      }
    }),
    prisma.referral.findMany({
      where: { partnerAccountId: partnerId },
      orderBy: { submittedAt: "desc" },
      take: 5
    }),
    prisma.deal.findMany({
      where: { partnerAccountId: partnerId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { referral: true }
    }),
    prisma.commissionLedgerEntry.aggregate({
      where: {
        partnerAccountId: partnerId,
        status: { not: CommissionLedgerStatus.VOID }
      },
      _sum: { amount: true }
    }),
    prisma.notification.findMany({
      where: { partnerAccountId: partnerId },
      orderBy: { createdAt: "desc" },
      take: 6
    })
  ]);

  return (
    <div className="stack-lg">
      <div className="stats-grid">
        <div className="stat">
          <span className="muted">Status</span>
          <strong>{partner.status.replaceAll("_", " ")}</strong>
        </div>
        <div className="stat">
          <span className="muted">Referrals</span>
          <strong>{referrals.length}</strong>
        </div>
        <div className="stat">
          <span className="muted">Tracked earnings</span>
          <strong>{formatCurrency(ledger._sum.amount?.toString() ?? 0)}</strong>
        </div>
        <div className="stat">
          <span className="muted">Stripe onboarding</span>
          <strong>{partner.stripeOnboardingComplete ? "Complete" : "Pending"}</strong>
        </div>
      </div>

      <div className="two-col">
        <SectionCard title="Referral status" eyebrow="Latest submissions">
          <div className="stack-md">
            {referrals.map((referral) => (
              <div className="note" key={referral.id}>
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <strong>{referral.referredCompany}</strong>
                  <StatusBadge value={referral.status} />
                </div>
                <p className="muted">{referral.useCaseSummary}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Deal tracking" eyebrow="Admin-managed pipeline">
          <div className="stack-md">
            {deals.length ? (
              deals.map((deal) => (
                <div className="note" key={deal.id}>
                  <div className="inline-form" style={{ justifyContent: "space-between" }}>
                    <strong>{deal.referral.referredCompany}</strong>
                    <StatusBadge value={deal.stage} />
                  </div>
                  <p className="muted">
                    {deal.ownerName} · {formatCurrency(deal.closedValue?.toString() ?? deal.expectedValue?.toString() ?? 0)}
                  </p>
                </div>
              ))
            ) : (
              <div className="empty-state">No deals linked to your referrals yet.</div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Notifications" eyebrow="Workflow updates">
        <div className="stack-md">
          {notifications.map((notification) => (
            <div className="note" key={notification.id}>
              <strong>{notification.title}</strong>
              <p className="muted">{notification.body}</p>
              <span className="muted">{formatDateTime(notification.createdAt)}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
