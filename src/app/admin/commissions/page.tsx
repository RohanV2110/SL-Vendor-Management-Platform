import { PartnerAccountStatus } from "@prisma/client";
import {
  createClawbackAction,
  createCommissionAction,
  updateCommissionStatusAction
} from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const statusTargets = ["APPROVED", "SCHEDULED", "PAYABLE", "PAID", "VOID"] as const;
const newEntryTypes = ["UPFRONT", "TRAILING", "ADJUSTMENT"] as const;
const newEntryStatuses = ["APPROVED", "SCHEDULED", "PAYABLE", "PAID"] as const;

export default async function AdminCommissionsPage() {
  const [entries, partners] = await Promise.all([
    prisma.commissionLedgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partnerAccount: true,
        referral: true,
        payoutBatch: true
      }
    }),
    prisma.partnerAccount.findMany({
      where: {
        status: { in: [PartnerAccountStatus.ACTIVE, PartnerAccountStatus.INVITED] }
      },
      orderBy: { company: "asc" },
      select: { id: true, company: true }
    })
  ]);

  return (
    <div className="stack-lg">
      <SectionCard title="Add commission" eyebrow="Manual ledger entry">
        {partners.length === 0 ? (
          <div className="empty-state">
            No partners available yet. Create a partner before adding a manual commission.
          </div>
        ) : (
          <form action={createCommissionAction} className="stack-md">
            <div className="two-col">
              <label className="field">
                <span>Partner</span>
                <select className="select" name="partnerAccountId" required defaultValue="">
                  <option value="" disabled>
                    Select a partner
                  </option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.company}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Type</span>
                <select className="select" name="type" defaultValue="UPFRONT" required>
                  {newEntryTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="two-col">
              <label className="field">
                <span>Amount (USD)</span>
                <input
                  className="input"
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 250.00"
                  required
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select className="select" name="status" defaultValue="APPROVED">
                  {newEntryStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Scheduled for (optional)</span>
              <input className="input" name="scheduledFor" type="date" />
            </label>

            <label className="field">
              <span>Description</span>
              <input
                className="input"
                name="description"
                placeholder="What is this commission for?"
                required
              />
            </label>

            <SubmitButton className="button" label="Add commission" pendingLabel="Saving..." />
          </form>
        )}
      </SectionCard>

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
    </div>
  );
}
