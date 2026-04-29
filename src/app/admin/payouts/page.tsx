import { CommissionLedgerStatus } from "@prisma/client";
import { createPayoutBatchAction, markPayoutBatchPaidAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function AdminPayoutsPage() {
  const [entries, batches] = await Promise.all([
    prisma.commissionLedgerEntry.findMany({
      where: {
        status: {
          in: [CommissionLedgerStatus.APPROVED, CommissionLedgerStatus.PAYABLE]
        },
        payoutBatchId: null
      },
      include: {
        partnerAccount: true,
        referral: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partnerAccount: true,
        commissionEntries: true
      }
    })
  ]);

  const grouped = Object.values(
    entries.reduce<Record<string, typeof entries>>((acc, entry) => {
      acc[entry.partnerAccountId] ||= [];
      acc[entry.partnerAccountId].push(entry);
      return acc;
    }, {})
  );

  return (
    <div className="stack-lg">
      <SectionCard title="Create payout batches" eyebrow="Approved and payable entries">
        <div className="stack-lg">
          {grouped.length ? (
            grouped.map((group) => (
              <form key={group[0].partnerAccountId} action={createPayoutBatchAction} className="panel" style={{ boxShadow: "none" }}>
                <div className="panel-body stack-md">
                  <input type="hidden" name="partnerAccountId" value={group[0].partnerAccountId} />
                  <div className="inline-form" style={{ justifyContent: "space-between" }}>
                    <strong>{group[0].partnerAccount.company}</strong>
                    <span className="muted">
                      {group.length} entries · {formatCurrency(group.reduce((sum, entry) => sum + Number(entry.amount), 0))}
                    </span>
                  </div>
                  {group.map((entry) => (
                    <input key={entry.id} type="hidden" name="entryIds" value={entry.id} />
                  ))}
                  <label className="field">
                    <span>Batch label</span>
                    <input className="input" name="label" defaultValue={`${group[0].partnerAccount.company} payout`} required />
                  </label>
                  <SubmitButton label="Create payout batch" pendingLabel="Creating..." />
                </div>
              </form>
            ))
          ) : (
            <div className="empty-state">No payout-ready entries without a batch.</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Existing payout batches" eyebrow="Batch history">
        <div className="stack-lg">
          {batches.map((batch) => (
            <div key={batch.id} className="panel" style={{ boxShadow: "none" }}>
              <div className="panel-body stack-md">
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{batch.label}</strong>
                    <p className="muted">{batch.partnerAccount.company}</p>
                  </div>
                  <StatusBadge value={batch.status} />
                </div>
                <p className="note">
                  Created {formatDateTime(batch.createdAt)} · Paid {formatDateTime(batch.paidAt)}
                  <br />
                  {batch.commissionEntries.length} entries · {formatCurrency(batch.commissionEntries.reduce((sum, entry) => sum + Number(entry.amount), 0))}
                </p>
                {batch.status !== "PAID" ? (
                  <form action={markPayoutBatchPaidAction} className="stack-md">
                    <input type="hidden" name="batchId" value={batch.id} />
                    <label className="field">
                      <span>Stripe payout ID</span>
                      <input className="input" name="stripePayoutId" placeholder="po_xxx (optional)" />
                    </label>
                    <SubmitButton label="Mark batch paid" pendingLabel="Marking..." />
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
