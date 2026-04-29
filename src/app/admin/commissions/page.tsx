import { createClawbackAction, updateCommissionStatusAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const statusTargets = ["APPROVED", "SCHEDULED", "PAYABLE", "PAID", "VOID"] as const;

export default async function AdminCommissionsPage() {
  const entries = await prisma.commissionLedgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      partnerAccount: true,
      referral: true,
      payoutBatch: true
    }
  });

  return (
    <SectionCard title="Commission ledger" eyebrow="Upfront, trailing, payout staging, clawbacks">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Referral</th>
              <th>Type</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Timing</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.partnerAccount.company}</td>
                <td>{entry.referral?.referredCompany ?? "—"}</td>
                <td>{entry.type}</td>
                <td>
                  <StatusBadge value={entry.status} />
                </td>
                <td>{formatCurrency(entry.amount.toString())}</td>
                <td>
                  Created {formatDateTime(entry.createdAt)}
                  <br />
                  Scheduled {formatDateTime(entry.scheduledFor)}
                </td>
                <td>
                  <div className="stack-md">
                    <form action={updateCommissionStatusAction} className="inline-form">
                      <input type="hidden" name="entryId" value={entry.id} />
                      <select className="select" name="status" defaultValue={entry.status}>
                        {statusTargets.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="button button-secondary" label="Update" pendingLabel="Saving..." />
                    </form>
                    {entry.type !== "CLAWBACK" ? (
                      <form action={createClawbackAction} className="stack-md">
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input className="input" name="reason" placeholder="Clawback reason" required />
                        <SubmitButton className="button button-ghost" label="Create clawback" pendingLabel="Creating..." />
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
