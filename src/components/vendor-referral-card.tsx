import { generateVendorReferralCodeAction } from "@/lib/actions";
import { CopyButton } from "@/components/copy-button";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { buildAriesReferralLink } from "@/lib/referral-links";

type VendorReferralCardProps = {
  partnerAccountId: string;
  vendorReferralCode: string | null;
  vendorReferralCodeActive: boolean;
  disabled?: boolean;
};

export function VendorReferralCard({
  partnerAccountId,
  vendorReferralCode,
  vendorReferralCodeActive,
  disabled = false
}: VendorReferralCardProps) {
  const referralLink =
    vendorReferralCode && vendorReferralCodeActive ? buildAriesReferralLink(vendorReferralCode) : null;

  if (disabled) {
    return (
      <SectionCard title="Referrals" eyebrow="Aries AI signup link">
        <div className="stack-md">
          <p className="muted">
            Your referral link will appear here once your account is activated.
          </p>
          <button
            className="button"
            type="button"
            disabled
            aria-disabled="true"
            title="Your account needs to be activated by the admin first."
          >
            Generate Referral Link
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Referrals" eyebrow="Aries AI signup link">
      <div className="stack-lg">
        {referralLink ? (
          <>
            <div className="referral-link-panel">
              <div>
                <span className="muted">Referral Link</span>
                <strong>{referralLink}</strong>
              </div>
              <CopyButton value={referralLink} label="Copy link" />
            </div>
            <div className="two-col">
              <div className="metric-card">
                <strong>Referral code</strong>
                <p className="muted">{vendorReferralCode}</p>
                {vendorReferralCode ? <CopyButton value={vendorReferralCode} label="Copy code" /> : null}
              </div>
              <div className="metric-card">
                <strong>Signup destination</strong>
                <p className="muted">Aries AI signup with partner attribution captured from the referral code.</p>
              </div>
            </div>
          </>
        ) : (
          <p className="muted">Generate a referral link to start adding deals.</p>
        )}
        <form action={generateVendorReferralCodeAction}>
          <input type="hidden" name="partnerAccountId" value={partnerAccountId} />
          <SubmitButton
            label={referralLink ? "Regenerate Referral Link" : "Generate Referral Link"}
            pendingLabel="Generating..."
          />
        </form>
      </div>
    </SectionCard>
  );
}
