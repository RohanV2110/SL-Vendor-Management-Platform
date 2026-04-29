import { ReferralStatus } from "@prisma/client";
import { addInternalNoteAction, saveDealAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const stages = ["NEW", "QUALIFYING", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] as const;

export default async function AdminDealsPage() {
  const [referrals, deals] = await Promise.all([
    prisma.referral.findMany({
      where: {
        status: {
          in: [ReferralStatus.APPROVED, ReferralStatus.CONVERTED, ReferralStatus.LOST]
        }
      },
      include: {
        partnerAccount: true,
        product: true,
        deal: true
      },
      orderBy: { approvedAt: "desc" }
    }),
    prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        referral: true,
        partnerAccount: true,
        notes: {
          include: { author: true },
          orderBy: { createdAt: "desc" }
        }
      }
    })
  ]);

  return (
    <div className="stack-lg">
      <SectionCard title="Create or update deals" eyebrow="Approved referrals">
        <div className="stack-lg">
          {referrals.map((referral) => (
            <form key={referral.id} action={saveDealAction} className="panel" style={{ boxShadow: "none" }}>
              <div className="panel-body stack-md">
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{referral.referredCompany}</strong>
                    <p className="muted">
                      {referral.partnerAccount.company} · {referral.product.name}
                    </p>
                  </div>
                  <StatusBadge value={referral.status} />
                </div>
                <input type="hidden" name="referralId" value={referral.id} />
                <div className="three-col">
                  <label className="field">
                    <span>Owner</span>
                    <input className="input" name="ownerName" defaultValue={referral.deal?.ownerName ?? "Sales Ops"} required />
                  </label>
                  <label className="field">
                    <span>Stage</span>
                    <select className="select" name="stage" defaultValue={referral.deal?.stage ?? "NEW"}>
                      {stages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Close date</span>
                    <input className="input" type="date" name="closeDate" defaultValue={referral.deal?.closeDate?.toISOString().slice(0, 10) ?? ""} />
                  </label>
                  <label className="field">
                    <span>Expected value</span>
                    <input className="input" type="number" min="0" step="0.01" name="expectedValue" defaultValue={referral.deal?.expectedValue?.toString() ?? ""} />
                  </label>
                  <label className="field">
                    <span>Closed value</span>
                    <input className="input" type="number" min="0" step="0.01" name="closedValue" defaultValue={referral.deal?.closedValue?.toString() ?? ""} />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <textarea className="textarea" name="notes" defaultValue={referral.deal?.summaryNotes ?? ""} />
                  </label>
                </div>
                <SubmitButton label="Save deal" pendingLabel="Saving..." />
              </div>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Existing deals" eyebrow="Deal tracking">
        <div className="stack-lg">
          {deals.map((deal) => (
            <div className="panel" key={deal.id} style={{ boxShadow: "none" }}>
              <div className="panel-body stack-md">
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{deal.referral.referredCompany}</strong>
                    <p className="muted">
                      {deal.partnerAccount.company} · Updated {formatDateTime(deal.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge value={deal.stage} />
                </div>
                <div className="three-col">
                  <p className="note">
                    <strong>Owner</strong>
                    <br />
                    {deal.ownerName}
                  </p>
                  <p className="note">
                    <strong>Expected / closed</strong>
                    <br />
                    {formatCurrency(deal.expectedValue?.toString() ?? 0)} / {formatCurrency(deal.closedValue?.toString() ?? 0)}
                  </p>
                  <p className="note">
                    <strong>Close date</strong>
                    <br />
                    {formatDate(deal.closeDate)}
                  </p>
                </div>
                {deal.summaryNotes ? (
                  <p className="note">
                    <strong>Deal summary</strong>
                    <br />
                    {deal.summaryNotes}
                  </p>
                ) : null}
                {deal.notes.map((note) => (
                  <div className="note" key={note.id}>
                    <strong>{note.author.name}</strong>
                    <p className="muted">{note.body}</p>
                  </div>
                ))}
                <form action={addInternalNoteAction} className="stack-md">
                  <input type="hidden" name="entityType" value="DEAL" />
                  <input type="hidden" name="entityId" value={deal.id} />
                  <textarea className="textarea" name="body" placeholder="Add deal context" required />
                  <SubmitButton className="button button-secondary" label="Add note" pendingLabel="Saving..." />
                </form>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
