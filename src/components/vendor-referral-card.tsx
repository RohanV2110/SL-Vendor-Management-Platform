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

  return (
    <SectionCard title="Referrals" eyebrow="Aries AI signup link">
      <div className="stack-lg">
        <div className="referral-link-panel">
          <div>
            <span className="muted">Referral Link</span>
            <strong>{referralLink ?? "Generate a referral link to start inviting affiliates."}</strong>
          </div>
          {referralLink ? <CopyButton value={referralLink} label="Copy link" /> : null}
        </div>
        <div className="two-col">
          <div className="metric-card">
            <strong>Referral code</strong>
            <p className="muted">{vendorReferralCode ?? "No code generated yet"}</p>
            {vendorReferralCode ? <CopyButton value={vendorReferralCode} label="Copy code" /> : null}
          </div>
          <div className="metric-card">
            <strong>Signup destination</strong>
            <p className="muted">Aries AI signup with partner attribution captured from the referral code.</p>
          </div>
        </div>
        {disabled ? (
          <button className="button" type="button" disabled aria-disabled="true">
            Generate Referral Link
          </button>
        ) : (
          <form action={generateVendorReferralCodeAction}>
            <input type="hidden" name="partnerAccountId" value={partnerAccountId} />
            <SubmitButton label="Generate Referral Link" pendingLabel="Generating..." />
          </form>
        )}
      </div>
    </SectionCard>
  );
}
