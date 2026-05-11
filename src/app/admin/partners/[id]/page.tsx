import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addInternalNoteAction,
  approvePartnerAction,
  markPartnerDocumentSignedAction
} from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export default async function AdminPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partnerAccount.findUnique({
    where: { id },
    include: {
      user: true,
      profile: true,
      application: {
        include: {
          answers: true
        }
      },
      agreements: {
        orderBy: { createdAt: "desc" }
      },
      referrals: {
        include: {
          product: true,
          deal: true
        },
        orderBy: { submittedAt: "desc" }
      },
      commissions: {
        orderBy: { createdAt: "desc" }
      },
      payoutBatches: {
        orderBy: { createdAt: "desc" }
      },
      notes: {
        include: { author: true },
        orderBy: { createdAt: "desc" }
      },
      snapshots: {
        orderBy: [{ year: "desc" }, { quarter: "desc" }]
      }
    }
  });

  if (!partner) {
    notFound();
  }

  const ndaSigned = Boolean(partner.ndaSignedAt);
  const agreementSigned = Boolean(partner.agreementSignedAt);
  const canActivate = ndaSigned && agreementSigned && partner.status !== "ACTIVE";

  return (
    <div className="stack-lg">
      <div className="button-row">
        <Link className="button button-secondary" href="/admin/partners">
          Back to Partners
        </Link>
        {partner.status !== "ACTIVE" ? (
          <form action={approvePartnerAction}>
            <input type="hidden" name="partnerAccountId" value={partner.id} />
            <SubmitButton
              label="Activate partner"
              pendingLabel="Activating..."
              disabled={!canActivate}
              title={
                canActivate
                  ? undefined
                  : "Mark NDA and agreement as signed before activating."
              }
            />
          </form>
        ) : null}
      </div>

      {partner.status !== "ACTIVE" ? (
        <SectionCard
          title="NDA & agreement approval"
          eyebrow="Required before activation"
        >
          <div className="stack-md">
            <p className="muted">
              Confirm the partner has signed both documents (e.g. via email) before
              activating their account.
            </p>
            <div className="two-col">
              <div className="note">
                <div
                  className="inline-form"
                  style={{ justifyContent: "space-between", gap: 8 }}
                >
                  <strong>NDA</strong>
                  <span
                    className={`deal-status deal-status--${
                      ndaSigned ? "approved" : "pending_approval"
                    }`}
                  >
                    {ndaSigned ? "Signed" : "Not signed"}
                  </span>
                </div>
                <p className="muted">
                  {ndaSigned
                    ? `Marked signed on ${formatDateTime(partner.ndaSignedAt)}`
                    : "Awaiting confirmation from the partner."}
                </p>
                <form action={markPartnerDocumentSignedAction}>
                  <input type="hidden" name="partnerAccountId" value={partner.id} />
                  <input type="hidden" name="documentType" value="NDA" />
                  <input
                    type="hidden"
                    name="signed"
                    value={ndaSigned ? "false" : "true"}
                  />
                  <SubmitButton
                    className={ndaSigned ? "button button-secondary" : "button"}
                    label={ndaSigned ? "Unmark NDA" : "Mark NDA as signed"}
                    pendingLabel="Saving..."
                  />
                </form>
              </div>
              <div className="note">
                <div
                  className="inline-form"
                  style={{ justifyContent: "space-between", gap: 8 }}
                >
                  <strong>Partner agreement</strong>
                  <span
                    className={`deal-status deal-status--${
                      agreementSigned ? "approved" : "pending_approval"
                    }`}
                  >
                    {agreementSigned ? "Signed" : "Not signed"}
                  </span>
                </div>
                <p className="muted">
                  {agreementSigned
                    ? `Marked signed on ${formatDateTime(partner.agreementSignedAt)}`
                    : "Awaiting confirmation from the partner."}
                </p>
                <form action={markPartnerDocumentSignedAction}>
                  <input type="hidden" name="partnerAccountId" value={partner.id} />
                  <input type="hidden" name="documentType" value="AGREEMENT" />
                  <input
                    type="hidden"
                    name="signed"
                    value={agreementSigned ? "false" : "true"}
                  />
                  <SubmitButton
                    className={agreementSigned ? "button button-secondary" : "button"}
                    label={
                      agreementSigned ? "Unmark agreement" : "Mark agreement as signed"
                    }
                    pendingLabel="Saving..."
                  />
                </form>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={partner.company || partner.primaryContactName} eyebrow="Partner profile" action={<StatusBadge value={partner.status} />}>
        <div className="three-col">
          <p className="note">
            <strong>Primary contact</strong>
            <br />
            {partner.primaryContactName}
            <br />
            {partner.primaryContactEmail}
            <br />
            {partner.phone || "—"}
          </p>
          <p className="note">
            <strong>Country</strong>
            <br />
            {partner.country || "—"}
            <br />
            <span className="muted">Activated {formatDate(partner.activatedAt)}</span>
          </p>
          <p className="note">
            <strong>Payout setup</strong>
            <br />
            {partner.stripeOnboardingComplete ? "Complete" : "Pending"}
            <br />
            <span className="muted">{partner.stripeAccountId ?? "No Stripe account yet"}</span>
          </p>
        </div>
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Application details" eyebrow="Onboarding inputs">
          <div className="stack-md">
            <p className="note">
              <strong>Promotional channels</strong>
              <br />
              {partner.profile?.promotionChannels || partner.application.promotionChannels || "—"}
            </p>
            <p className="note">
              <strong>Level of experience</strong>
              <br />
              {partner.profile?.aiTechExperience || partner.application.aiTechExperience || "—"}
            </p>
            <p className="note">
              <strong>Audience</strong>
              <br />
              {partner.profile?.audienceDescription || partner.application.audienceDescription || "—"}
            </p>
            {partner.application.answers.map((answer) => (
              <div className="note" key={answer.id}>
                <strong>{answer.promptSnapshot}</strong>
                <p className="muted">{answer.response}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Program activity" eyebrow="Performance and payouts">
          <div className="stack-md">
            <p className="note">
              <strong>Referrals</strong>
              <br />
              {partner.referrals.length}
            </p>
            <p className="note">
              <strong>Earnings tracked</strong>
              <br />
              {formatCurrency(partner.commissions.reduce((sum, entry) => sum + Number(entry.amount), 0))}
            </p>
            <p className="note">
              <strong>Payout batches</strong>
              <br />
              {partner.payoutBatches.length}
            </p>
            {partner.snapshots[0] ? (
              <p className="note">
                <strong>Latest activity snapshot</strong>
                <br />
                Q{partner.snapshots[0].quarter} {partner.snapshots[0].year} · {partner.snapshots[0].status}
              </p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Referrals and deals" eyebrow="Current pipeline">
        <div className="stack-md">
          {partner.referrals.length ? (
            partner.referrals.map((referral) => (
              <div className="note" key={referral.id}>
                <div className="inline-form" style={{ justifyContent: "space-between" }}>
                  <strong>{referral.referredCompany}</strong>
                  <StatusBadge value={referral.status} />
                </div>
                <p className="muted">
                  {referral.product.name} · {referral.deal?.stage ?? "No deal yet"} · Submitted {formatDateTime(referral.submittedAt)}
                </p>
              </div>
            ))
          ) : (
            <div className="empty-state">No referrals yet.</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Internal notes" eyebrow="Admin-only context">
        <div className="stack-md">
          {partner.notes.map((note) => (
            <div className="note" key={note.id}>
              <strong>{note.author.name}</strong> <span className="muted">{formatDateTime(note.createdAt)}</span>
              <p className="muted">{note.body}</p>
            </div>
          ))}
          <form action={addInternalNoteAction} className="stack-md">
            <input type="hidden" name="entityType" value="PARTNER" />
            <input type="hidden" name="entityId" value={partner.id} />
            <textarea className="textarea" name="body" placeholder="Add a partner note" required />
            <SubmitButton className="button button-secondary" label="Add note" pendingLabel="Saving..." />
          </form>
        </div>
      </SectionCard>
    </div>
  );
}
