"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Layers, MoreHorizontal, X } from "lucide-react";
import { deletePartnerAccountAction, updatePartnerTierAction } from "@/lib/actions";
import { CopyButton } from "@/components/copy-button";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export type PartnerDialogReferral = {
  id: string;
  referredCompany: string;
  status: string;
  productName: string;
  submittedAt: string;
};

export type PartnerDialogTier = {
  id: string;
  name: string;
};

export type PartnerDialogData = {
  id: string;
  company: string;
  primaryContactName: string;
  primaryContactEmail: string;
  phone: string;
  country: string;
  status: string;
  activatedAt: string | null;
  createdAt: string;
  stripeOnboardingComplete: boolean;
  stripeAccountId: string | null;
  tierId: string;
  tierName: string | null;
  vendorReferralCode: string | null;
  vendorReferralCodeActive: boolean;
  referralLink: string | null;
  referralsCount: number;
  earningsTotal: number;
  payoutBatchesCount: number;
  promotionChannels: string | null;
  aiTechExperience: string | null;
  audienceDescription: string | null;
  recentReferrals: PartnerDialogReferral[];
  detailHref: string;
};

type PartnerDetailsDialogProps = {
  partner: PartnerDialogData;
  tiers: PartnerDialogTier[];
};

export function PartnerDetailsDialog({ partner, tiers }: PartnerDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState(partner.tierId);
  const [isPending, startTransition] = useTransition();

  const triggerLabel = partner.company || partner.primaryContactName || partner.primaryContactEmail;
  const currentTierName =
    tiers.find((tier) => tier.id === tierId)?.name ?? partner.tierName ?? "Unassigned";

  function handleDelete() {
    const label = partner.company || partner.primaryContactName;
    if (
      !window.confirm(
        `Delete partner "${label}"? This removes their account, application, and related records. This cannot be undone.`
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("partnerAccountId", partner.id);
    startTransition(() => {
      void deletePartnerAccountAction(formData);
    });
  }

  return (
    <>
      <button
        aria-label={`View details for ${triggerLabel}`}
        className="icon-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        <MoreHorizontal size={18} />
      </button>

      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            aria-modal="true"
            className="dialog-panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div className="dialog-header__copy">
                <p className="eyebrow">Partner details</p>
                <h2>{partner.company || partner.primaryContactName}</h2>
                <p className="muted">Sugar &amp; Leather · {partner.primaryContactEmail}</p>
              </div>
              <button
                aria-label="Close details"
                className="icon-button"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="dialog-content stack-lg">
              <div className="three-col">
                <p className="note">
                  <strong>Status</strong>
                  <br />
                  <StatusBadge value={partner.status} />
                  <br />
                  <span className="muted">Joined {formatDate(partner.createdAt)}</span>
                </p>
                <div className="partner-tier-card">
                  <div className="partner-tier-card__header">
                    <div className="partner-tier-card__icon" aria-hidden>
                      <Layers size={20} strokeWidth={1.75} />
                    </div>
                    <div className="partner-tier-card__title">
                      <p className="partner-tier-card__eyebrow">Commission tier</p>
                      <p className="partner-tier-card__name">{currentTierName}</p>
                    </div>
                  </div>

                  <form action={updatePartnerTierAction} className="partner-tier-card__form">
                    <input type="hidden" name="partnerAccountId" value={partner.id} />
                    <label className="partner-tier-card__field">
                      <span>Change tier</span>
                      <div className="partner-tier-card__select-row">
                        <select
                          className="select partner-tier-card__select"
                          name="tierId"
                          value={tierId}
                          onChange={(event) => setTierId(event.target.value)}
                          required
                        >
                          {tiers.map((tier) => (
                            <option key={tier.id} value={tier.id}>
                              {tier.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton
                          className="button partner-tier-card__save"
                          label="Save"
                          pendingLabel="Saving..."
                        />
                      </div>
                    </label>
                  </form>

                  <p className="partner-tier-card__meta">
                    {partner.activatedAt
                      ? `Activated ${formatDate(partner.activatedAt)}`
                      : "Not activated yet"}
                  </p>
                </div>
                <p className="note">
                  <strong>Partner ID</strong>
                  <br />
                  <code>{partner.id}</code>
                </p>
              </div>

              <div className="two-col">
                <div className="stack-md">
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
                  </p>
                  <p className="note">
                    <strong>Payout setup</strong>
                    <br />
                    {partner.stripeOnboardingComplete ? "Complete" : "Pending"}
                    <br />
                    <span className="muted">{partner.stripeAccountId ?? "No Stripe account yet"}</span>
                  </p>
                </div>
                <div className="stack-md">
                  <p className="note">
                    <strong>Referral code</strong>
                    <br />
                    {partner.vendorReferralCode ? (
                      <>
                        <code>{partner.vendorReferralCode}</code>
                        <br />
                        <span className="muted">
                          {partner.vendorReferralCodeActive ? "Active" : "Inactive"}
                        </span>
                      </>
                    ) : (
                      <span className="muted">No code generated yet.</span>
                    )}
                  </p>
                  {partner.referralLink ? (
                    <p className="note">
                      <strong>Referral link</strong>
                      <br />
                      <a href={partner.referralLink} target="_blank" rel="noreferrer">
                        {partner.referralLink}
                      </a>
                      <br />
                      <CopyButton value={partner.referralLink} label="Copy link" />
                    </p>
                  ) : null}
                  <div className="three-col">
                    <p className="note">
                      <strong>Referrals</strong>
                      <br />
                      {partner.referralsCount}
                    </p>
                    <p className="note">
                      <strong>Earnings</strong>
                      <br />
                      {formatCurrency(partner.earningsTotal)}
                    </p>
                    <p className="note">
                      <strong>Payouts</strong>
                      <br />
                      {partner.payoutBatchesCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="two-col">
                <p className="note">
                  <strong>Promotional channels</strong>
                  <br />
                  {partner.promotionChannels || "—"}
                </p>
                <p className="note">
                  <strong>Experience</strong>
                  <br />
                  {partner.aiTechExperience || "—"}
                </p>
              </div>
              <p className="note">
                <strong>Audience</strong>
                <br />
                {partner.audienceDescription || "—"}
              </p>

              <div className="stack-md">
                <strong>Recent referrals</strong>
                {partner.recentReferrals.length ? (
                  partner.recentReferrals.map((referral) => (
                    <div className="note" key={referral.id}>
                      <div className="inline-form" style={{ justifyContent: "space-between" }}>
                        <strong>{referral.referredCompany}</strong>
                        <StatusBadge value={referral.status} />
                      </div>
                      <p className="muted">
                        {referral.productName} · Submitted {formatDateTime(referral.submittedAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No referrals yet.</div>
                )}
              </div>

              <div className="dialog-footer button-row">
                <Link className="button button-secondary" href={partner.detailHref}>
                  Open full profile
                </Link>
                <button
                  className="button button-delete"
                  type="button"
                  disabled={isPending}
                  onClick={handleDelete}
                >
                  {isPending ? "Deleting..." : "Delete partner"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
