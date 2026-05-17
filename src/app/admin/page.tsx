import { PartnerApplicationStatus, ReferralStatus } from "@prisma/client";
import { AdminNotificationList } from "@/components/admin/admin-notification-list";
import { prisma } from "@/lib/prisma";
import { SectionCard } from "@/components/section-card";
import { formatCurrency } from "@/lib/utils";
import { requireRole } from "@/lib/auth-helpers";

export default async function AdminOverviewPage() {
  const admin = await requireRole("ADMIN");

  const [applications, pendingApplications, pendingReferrals, ledger, notifications] =
    await Promise.all([
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
        where: {
          userId: admin.id,
          readAt: null
        },
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

      <SectionCard title="Recent notifications">
        <AdminNotificationList
          notifications={notifications.map((notification) => ({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            createdAt: notification.createdAt.toISOString()
          }))}
        />
      </SectionCard>
    </div>
  );
}
