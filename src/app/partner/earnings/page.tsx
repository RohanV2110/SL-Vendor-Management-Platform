import { redirect } from "next/navigation";
import { confirmStripeOnboardingAction, startStripeOnboardingAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function PartnerEarningsPage() {
  const partnerId = await requirePartnerAccountId();

  const [partner, entries, payoutBatches] = await Promise.all([
    prisma.partnerAccount.findUnique({
      where: { id: partnerId }
    }),
    prisma.commissionLedgerEntry.findMany({
      where: { partnerAccountId: partnerId },
      include: { payoutBatch: true, referral: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payoutBatch.findMany({
      where: { partnerAccountId: partnerId },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (!partner) {
    redirect("/apply");
  }

  return (
    <div className="stack-lg">
      <SectionCard title="Payout readiness" eyebrow="Stripe Connect Express">
        <div className="two-col">
          <p className="note">
            <strong>Account status</strong>
            <br />
            {partner.stripeAccountId ?? "Not connected"}
            <br />
            <span className="muted">{partner.stripeOnboardingComplete ? "Ready for payouts" : "Action required"}</span>
          </p>
          <div className="stack-md">
            {env.stripeSecretKey ? (
              <>
                <form action={startStripeOnboardingAction}>
                  <SubmitButton label="Start Stripe onboarding" pendingLabel="Redirecting..." />
                </form>
                {!partner.stripeOnboardingComplete ? (
                  <form action={confirmStripeOnboardingAction}>
                    <SubmitButton className="button button-secondary" label="Mark onboarding complete" pendingLabel="Saving..." />
                  </form>
                ) : null}
              </>
            ) : (
              <p className="muted">Stripe Connect is not yet configured for this platform. Payout setup will become available once Stripe is enabled.</p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Commission ledger" eyebrow="Approved, scheduled, payable, paid">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Referral</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Timing</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.referral?.referredCompany ?? "Manual adjustment"}</td>
                  <td>{entry.type}</td>
                  <td>
                    <StatusBadge value={entry.status} />
                  </td>
                  <td>{formatCurrency(entry.amount.toString())}</td>
                  <td>
                    Created {formatDateTime(entry.createdAt)}
                    <br />
                    Paid {formatDateTime(entry.paidAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Payout batches" eyebrow="Batch history">
        <div className="stack-md">
          {payoutBatches.length ? (
            payoutBatches.map((batch) => (
              <div className="note" key={batch.id}>
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <strong>{batch.label}</strong>
                  <StatusBadge value={batch.status} />
                </div>
                <p className="muted">
                  {batch.stripePayoutId ?? "No Stripe payout ID"} · {formatDateTime(batch.paidAt)}
                </p>
              </div>
            ))
          ) : (
            <div className="empty-state">No payout batches yet.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
