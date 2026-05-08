import { reviewReferralAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";
import { prisma } from "@/lib/prisma";
import { buildAriesReferralLink } from "@/lib/referral-links";
import { formatDateTime } from "@/lib/utils";

export default async function AdminReferralsPage() {
  const referrals = await prisma.referral.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      partnerAccount: true,
      product: true
    }
  });

  return (
    <SectionCard title="Referrals" eyebrow="Partner-submitted leads">
      {referrals.length === 0 ? (
        <div className="empty-state">No referrals yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Partner</th>
                <th>Referral ID</th>
                <th>Link</th>
                <th>Lead</th>
                <th>Status</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {referrals.map((referral) => {
                const code = referral.partnerAccount.vendorReferralCode;
                const codeActive = referral.partnerAccount.vendorReferralCodeActive;
                const referralLink = code && codeActive ? buildAriesReferralLink(code) : null;

                return (
                  <tr key={referral.id}>
                    <td>
                      <strong>{referral.partnerAccount.company}</strong>
                      <br />
                      <span className="muted">{referral.partnerAccount.primaryContactEmail}</span>
                    </td>
                    <td>
                      <code>{referral.id}</code>
                    </td>
                    <td>
                      {referralLink ? (
                        <div className="stack-md">
                          <a href={referralLink} target="_blank" rel="noreferrer">
                            {code}
                          </a>
                          <CopyButton value={referralLink} label="Copy link" />
                        </div>
                      ) : (
                        <span className="muted">No active code</span>
                      )}
                    </td>
                    <td>
                      <strong>{referral.referredCompany}</strong>
                      <br />
                      <span className="muted">{referral.product.name}</span>
                    </td>
                    <td>
                      <StatusBadge value={referral.status} />
                    </td>
                    <td>{formatDateTime(referral.submittedAt)}</td>
                    <td>
                      {referral.status === "SUBMITTED" ? (
                        <div className="stack-md">
                          <form action={reviewReferralAction} className="inline-form">
                            <input type="hidden" name="referralId" value={referral.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <SubmitButton
                              className="button button-secondary table-action-button"
                              label="Approve"
                              pendingLabel="..."
                            />
                          </form>
                          <form action={reviewReferralAction} className="inline-form">
                            <input type="hidden" name="referralId" value={referral.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <SubmitButton
                              className="button button-ghost table-action-button"
                              label="Reject"
                              pendingLabel="..."
                            />
                          </form>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
