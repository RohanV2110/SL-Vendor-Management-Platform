import { PartnerApplicationStatus, ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SectionCard } from "@/components/section-card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

export default async function AdminOverviewPage() {
  const [applications, pendingApplications, pendingReferrals, ledger, notifications] = await Promise.all([
    prisma.partnerApplication.count(),
    prisma.partnerApplication.count({
      where: {
        status: {
          in: [
            PartnerApplicationStatus.SUBMITTED,
            PartnerApplicationStatus.UNDER_REVIEW,
            PartnerApplicationStatus.SIGNED_DOCUMENTS_UPLOADED
          ]
        }
      }
    }),
    prisma.referral.count({
      where: { status: { in: [ReferralStatus.SUBMITTED, ReferralStatus.UNDER_REVIEW] } }
    }),
    prisma.commissionLedgerEntry.aggregate({
      _sum: { amount: true }
    }),
    prisma.notification.findMany({
      where: { user: { is: { role: "ADMIN" } } },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  return (
    <div className="stack-lg">
      <div className="stats-grid">
        <div className="stat">
          <span className="muted">Applications</span>
          <strong>{applications}</strong>
        </div>
        <div className="stat">
          <span className="muted">Pending reviews</span>
          <strong>{pendingApplications}</strong>
        </div>
        <div className="stat">
          <span className="muted">Referrals awaiting action</span>
          <strong>{pendingReferrals}</strong>
        </div>
        <div className="stat">
          <span className="muted">Ledger total</span>
          <strong>{formatCurrency(ledger._sum.amount?.toString() ?? 0)}</strong>
        </div>
      </div>

      <SectionCard title="Recent notifications" eyebrow="Internal alerts">
        {notifications.length ? (
          <div className="stack-md">
            {notifications.map((notification) => (
              <div className="note" key={notification.id}>
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <strong>{notification.title}</strong>
                  <span className="muted">{formatDateTime(notification.createdAt)}</span>
                </div>
                <p className="muted">{notification.body}</p>
                {notification.readAt ? <StatusBadge value="READ" /> : <StatusBadge value="UNREAD" />}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No admin notifications yet.</div>
        )}
      </SectionCard>
    </div>
  );
}
