import { redirect } from "next/navigation";
import { refreshQuarterlyActivityAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function PartnerActivityPage() {
  const partnerId = await requirePartnerAccountId();
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerId },
    select: { tierId: true }
  });

  if (!partner) {
    redirect("/apply");
  }

  const [snapshot, rules] = await Promise.all([
    prisma.quarterlyActivitySnapshot.findFirst({
      where: { partnerAccountId: partnerId },
      orderBy: [{ year: "desc" }, { quarter: "desc" }]
    }),
    prisma.tierRule.findMany({
      where: { tierId: partner.tierId },
      orderBy: { createdAt: "desc" },
      take: 1
    })
  ]);

  const rule = rules[0];

  return (
    <div className="stack-lg">
      <SectionCard title="Quarterly activity tracking" eyebrow="Program activity">
        <div className="stack-lg">
          <div className="two-col activity-grid">
            <p className="note activity-card">
              <strong>Thresholds</strong>
              <span className="activity-card-lines">
                Approved referrals: {rule?.quarterlyApprovedReferralsMin ?? 0}
                <br />
                Converted deals: {rule?.quarterlyConvertedDealsMin ?? 0}
                <br />
                Revenue minimum: {formatCurrency(rule?.quarterlyRevenueMin?.toString() ?? 0)}
                <br />
                Commission minimum: {formatCurrency(rule?.quarterlyCommissionMin?.toString() ?? 0)}
              </span>
            </p>
            {snapshot ? (
              <div className="note activity-card">
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <strong>
                    Q{snapshot.quarter} {snapshot.year}
                  </strong>
                  <StatusBadge value={snapshot.status} />
                </div>
                <p className="muted">
                  {snapshot.approvedReferrals} approved referrals
                  <br />
                  {snapshot.convertedDeals} converted deals
                  <br />
                  {formatCurrency(snapshot.revenueAmount.toString())} revenue
                  <br />
                  {formatCurrency(snapshot.commissionAmount.toString())} commission
                </p>
              </div>
            ) : (
              <div className="empty-state activity-empty-card">No activity snapshot yet. Refresh to generate one.</div>
            )}
          </div>
          <div>
            <form action={refreshQuarterlyActivityAction}>
              <SubmitButton label="Refresh activity snapshot" pendingLabel="Refreshing..." />
            </form>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
