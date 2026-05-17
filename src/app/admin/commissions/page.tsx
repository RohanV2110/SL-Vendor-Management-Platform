import {
  CommissionEntryType,
  PartnerAccountStatus
} from "@prisma/client";
import {
  createClawbackAction,
  stopPartnerDealTrailingAction,
  updateCommissionStatusAction,
  verifyTrailingCommissionAction
} from "@/lib/actions";
import { AdminAddCommissionDialog } from "@/components/admin/admin-add-commission-dialog";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const statusTargets = ["APPROVED", "SCHEDULED", "PAYABLE", "PAID", "VOID"] as const;

const TYPE_LABELS: Record<CommissionEntryType, string> = {
  UPFRONT: "Upfront",
  TRAILING: "Trailing",
  CLAWBACK: "Clawback",
  ADJUSTMENT: "Adjustment"
};

export default async function AdminCommissionsPage() {
  const [entries, partners] = await Promise.all([
    prisma.commissionLedgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partnerAccount: true,
        referral: true,
        partnerDeal: {
          select: {
            id: true,
            name: true,
            companyName: true,
            trailingStoppedAt: true
          }
        },
        payoutBatch: true,
        trailingVerifiedBy: { select: { name: true } }
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

  const stopTrailingDealIds = new Set<string>();
  for (const entry of entries) {
    if (
      entry.partnerDealId &&
      entry.partnerDeal &&
      !entry.partnerDeal.trailingStoppedAt &&
      entry.type === CommissionEntryType.TRAILING
    ) {
      stopTrailingDealIds.add(entry.partnerDealId);
    }
  }

  return (
    <div className="stack-lg">
      <SectionCard
        title="Commission ledger"
        eyebrow="Auto-generated from won deals; manual adjustments supported"
        action={<AdminAddCommissionDialog partners={partners} />}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Timing</th>
                <th>Verification</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const sourceLabel =
                  entry.partnerDeal?.name ?? entry.referral?.referredCompany ?? "—";
                const sourceDetail = entry.partnerDeal?.companyName ?? null;
                const showStopTrailing =
                  entry.partnerDealId && stopTrailingDealIds.has(entry.partnerDealId);

                return (
                  <tr key={entry.id}>
                    <td>{entry.partnerAccount.company}</td>
                    <td>
                      {sourceLabel}
                      {sourceDetail ? (
                        <>
                          <br />
                          <span className="muted">{sourceDetail}</span>
                        </>
                      ) : null}
                    </td>
                    <td>{TYPE_LABELS[entry.type]}</td>
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
                      {entry.type === CommissionEntryType.TRAILING ? (
                        <div className="stack-md">
                          {entry.trailingVerifiedAt ? (
                            <p className="muted" style={{ margin: 0 }}>
                              Verified {formatDateTime(entry.trailingVerifiedAt)}
                              {entry.trailingVerifiedBy
                                ? ` · ${entry.trailingVerifiedBy.name}`
                                : ""}
                            </p>
                          ) : (
                            <p className="muted" style={{ margin: 0 }}>
                              Awaiting admin verification
                            </p>
                          )}
                          <form action={verifyTrailingCommissionAction} className="inline-form">
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input
                              type="hidden"
                              name="verified"
                              value={entry.trailingVerifiedAt ? "false" : "true"}
                            />
                            <SubmitButton
                              className="button button-secondary"
                              label={
                                entry.trailingVerifiedAt ? "Clear verification" : "Mark verified"
                              }
                              pendingLabel="Saving..."
                            />
                          </form>
                          {showStopTrailing ? (
                            <form action={stopPartnerDealTrailingAction}>
                              <input
                                type="hidden"
                                name="partnerDealId"
                                value={entry.partnerDealId!}
                              />
                              <SubmitButton
                                className="button button-ghost button-delete"
                                label="Stop trailing commissions"
                                pendingLabel="Stopping..."
                              />
                            </form>
                          ) : entry.partnerDeal?.trailingStoppedAt ? (
                            <span className="muted">Trailing stopped for this deal</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
                          <SubmitButton
                            className="button button-secondary"
                            label="Update"
                            pendingLabel="Saving..."
                          />
                        </form>
                        {entry.type !== CommissionEntryType.CLAWBACK ? (
                          <form action={createClawbackAction} className="stack-md">
                            <input type="hidden" name="entryId" value={entry.id} />
                            <input
                              className="input"
                              name="reason"
                              placeholder="Clawback reason"
                              required
                            />
                            <SubmitButton
                              className="button button-ghost"
                              label="Create clawback"
                              pendingLabel="Creating..."
                            />
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}