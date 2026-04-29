import { addInternalNoteAction, reviewReferralAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function AdminReferralsPage() {
  const referrals = await prisma.referral.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      partnerAccount: true,
      product: true,
      package: true,
      deal: true,
      notes: {
        include: { author: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  return (
    <div className="stack-lg">
      {referrals.map((referral) => (
        <SectionCard
          key={referral.id}
          eyebrow={referral.partnerAccount.company}
          title={referral.referredCompany}
          action={<StatusBadge value={referral.status} />}
        >
          <div className="three-col">
            <p className="note">
              <strong>Referral contact</strong>
              <br />
              {referral.referredContactName}
              <br />
              {referral.referredContactEmail ?? "No email"}
              <br />
              {referral.referredDomain ?? "No domain"}
            </p>
            <p className="note">
              <strong>Product/package</strong>
              <br />
              {referral.product.name}
              <br />
              {referral.package?.name ?? "No package selected"}
              <br />
              <span className="muted">Submitted {formatDateTime(referral.submittedAt)}</span>
            </p>
            <p className="note">
              <strong>Expected value</strong>
              <br />
              {formatCurrency(referral.estimatedDealValue?.toString() ?? 0)}
              <br />
              <span className="muted">{referral.isAttributed ? "Attributed lead" : "Duplicate, not attributed"}</span>
            </p>
          </div>
          <div className="two-col" style={{ marginTop: 24 }}>
            <p className="note">
              <strong>Use case</strong>
              <br />
              {referral.useCaseSummary}
            </p>
            <p className="note">
              <strong>Source notes</strong>
              <br />
              {referral.sourceNotes}
            </p>
          </div>
          {referral.status === "SUBMITTED" ? (
            <div className="two-col" style={{ marginTop: 24 }}>
              <form action={reviewReferralAction} className="stack-md">
                <input type="hidden" name="referralId" value={referral.id} />
                <input type="hidden" name="decision" value="approve" />
                <SubmitButton label="Approve referral" pendingLabel="Approving..." />
              </form>
              <form action={reviewReferralAction} className="stack-md">
                <input type="hidden" name="referralId" value={referral.id} />
                <input type="hidden" name="decision" value="reject" />
                <textarea className="textarea" name="reason" placeholder="Optional rejection reason" />
                <SubmitButton className="button button-secondary" label="Reject referral" pendingLabel="Rejecting..." />
              </form>
            </div>
          ) : null}
          <div style={{ marginTop: 24 }} className="stack-md">
            {referral.notes.map((note) => (
              <div className="note" key={note.id}>
                <strong>{note.author.name}</strong>
                <p className="muted">{note.body}</p>
              </div>
            ))}
            <form action={addInternalNoteAction} className="stack-md">
              <input type="hidden" name="entityType" value="REFERRAL" />
              <input type="hidden" name="entityId" value={referral.id} />
              <textarea className="textarea" name="body" placeholder="Add a referral note" required />
              <SubmitButton className="button button-secondary" label="Add note" pendingLabel="Saving..." />
            </form>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
