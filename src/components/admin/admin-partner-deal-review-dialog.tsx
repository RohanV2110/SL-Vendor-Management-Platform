"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PartnerDealStage, PartnerDealStatus } from "@prisma/client";
import { Trash2, X } from "lucide-react";
import {
  deletePartnerDealAction,
  reviewPartnerDealAction,
  updatePartnerDealAction,
  updatePartnerDealStageAction,
  type PartnerDealFormState
} from "@/lib/actions";
import { PartnerDealFormFields, type PartnerDealEditable } from "@/components/partner-deal-form-fields";

const initialState: PartnerDealFormState = { status: "idle" };

const STAGE_OPTIONS: { value: PartnerDealStage; label: string }[] = [
  { value: "PROCESSING", label: "Processing" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" }
];

const STATUS_LABELS: Record<PartnerDealStatus, string> = {
  PENDING_APPROVAL: "INACTIVE",
  APPROVED: "Active",
  REJECTED: "Rejected"
};

export type AdminPartnerDealReviewRow = {
  id: string;
  updatedAt: string;
  status: PartnerDealStatus;
  stage: PartnerDealStage | null | undefined;
  name: string;
  email: string;
  companyName: string;
  website: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  country: string;
  state: string;
  notes: string | null;
  dealValue: string | null;
  referredByLabel: string;
  referredByEmail: string;
};

type AdminPartnerDealReviewDialogProps = {
  deal: AdminPartnerDealReviewRow;
};

const DEFAULT_STAGE: PartnerDealStage = "PROCESSING";

function statusClass(status: PartnerDealStatus) {
  return `deal-status deal-status--${status.toLowerCase()}`;
}

export function AdminPartnerDealReviewDialog({ deal }: AdminPartnerDealReviewDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<PartnerDealStage>(deal.stage ?? DEFAULT_STAGE);
  const [country, setCountry] = useState(deal.country);
  const [dialCode, setDialCode] = useState(deal.phoneCountryCode ?? "");
  const [formState, setFormState] = useState<PartnerDealFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const existing: PartnerDealEditable = {
    id: deal.id,
    name: deal.name,
    email: deal.email,
    companyName: deal.companyName,
    website: deal.website,
    phoneCountryCode: deal.phoneCountryCode,
    phoneNumber: deal.phoneNumber,
    country: deal.country,
    state: deal.state,
    notes: deal.notes,
    dealValue: deal.dealValue
  };

  function resetDealFormState() {
    setStage(deal.stage ?? DEFAULT_STAGE);
    setCountry(deal.country);
    setDialCode(deal.phoneCountryCode ?? "");
    setFormState(initialState);
    setConfirmDeleteOpen(false);
  }

  function openDialog() {
    resetDealFormState();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setConfirmDeleteOpen(false);
    setFormState(initialState);
  }

  function getFieldError(field: keyof NonNullable<PartnerDealFormState["fieldErrors"]>) {
    return formState.fieldErrors?.[field];
  }

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await updatePartnerDealAction(formState, formData);
      setFormState(result);
      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  function handleStageChange(next: PartnerDealStage) {
    setStage(next);
    const fd = new FormData();
    fd.set("dealId", deal.id);
    fd.set("stage", next);
    startTransition(() => {
      void (async () => {
        try {
          await updatePartnerDealStageAction(fd);
          router.refresh();
        } catch {
          setStage(deal.stage ?? DEFAULT_STAGE);
        }
      })();
    });
  }

  function handleReviewDecision(decision: "APPROVED" | "REJECTED") {
    const fd = new FormData();
    fd.set("dealId", deal.id);
    fd.set("decision", decision);
    startTransition(() => {
      void (async () => {
        await reviewPartnerDealAction(fd);
        close();
        router.refresh();
      })();
    });
  }

  function handleDeleteConfirmed() {
    const fd = new FormData();
    fd.set("dealId", deal.id);
    startTransition(() => {
      void (async () => {
        await deletePartnerDealAction(fd);
        setConfirmDeleteOpen(false);
        close();
        router.refresh();
      })();
    });
  }

  const stageClass = stage.toLowerCase();
  const isPendingApproval = deal.status === "PENDING_APPROVAL";

  return (
    <>
      <button
        className="button button-secondary deal-review-trigger"
        type="button"
        onClick={openDialog}
      >
        Review
      </button>
      {open ? (
        <>
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (confirmDeleteOpen) {
              setConfirmDeleteOpen(false);
              return;
            }
            close();
          }}
        >
          <div
            className="dialog-panel add-affiliate-panel deal-review-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Review deal: ${deal.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header dialog-header--deal-review">
              <div className="dialog-header__copy">
                <p className="eyebrow">Review deal</p>
                <div className="deal-review-header-title-row">
                  <h2>{deal.name}</h2>
                  {isPendingApproval ? (
                    <div className="deal-review-header-actions">
                      <button
                        className="button deal-review-header-actions__approve"
                        type="button"
                        disabled={isPending}
                        onClick={() => handleReviewDecision("APPROVED")}
                      >
                        Approve
                      </button>
                      <button
                        className="button button-secondary deal-review-header-actions__reject"
                        type="button"
                        disabled={isPending}
                        onClick={() => handleReviewDecision("REJECTED")}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="muted">{deal.companyName}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={close}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-content stack-lg deal-review-dialog-content">
              <div className="note deal-review-meta-row" style={{ margin: 0 }}>
                <div className="deal-review-meta-row__left">
                  <strong className="deal-review-meta-row__title">Referred by</strong>
                  <span className="deal-review-meta-row__line">
                    {deal.referredByLabel}
                    <span className="muted"> · {deal.referredByEmail}</span>
                  </span>
                </div>
                <div className="deal-review-meta-row__right">
                  <strong className="deal-review-meta-row__title">Approval status</strong>
                  <span className={statusClass(deal.status)}>{STATUS_LABELS[deal.status]}</span>
                </div>
              </div>

              <div className="partner-tier-card" style={{ gap: 12 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>Stage</span>
                  <select
                    aria-label="Deal stage"
                    className={`select deal-stage-select deal-stage-select--${stageClass}`}
                    disabled={isPending}
                    value={stage}
                    onChange={(event) => handleStageChange(event.target.value as PartnerDealStage)}
                  >
                    {STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    Approve the deal first. Mark Won after setting deal value to auto-generate
                    upfront and trailing commissions. Lost voids commissions.
                  </small>
                </label>
              </div>

              <form action={handleSave} className="stack-lg" key={`${deal.id}-${deal.updatedAt}`}>
                <input type="hidden" name="dealId" value={deal.id} />
                <input type="hidden" name="actorRole" value="ADMIN" />

                {formState.status === "error" && formState.error ? (
                  <div className="form-message" role="alert">
                    {formState.error}
                  </div>
                ) : null}

                <PartnerDealFormFields
                  existing={existing}
                  country={country}
                  setCountry={setCountry}
                  dialCode={dialCode}
                  setDialCode={setDialCode}
                  getFieldError={getFieldError}
                  isEdit
                  actorRole="ADMIN"
                />

                <div className="deal-review-form-actions">
                  <div className="deal-review-form-actions__primary">
                    <button className="button" type="submit" disabled={isPending}>
                      {isPending ? "Saving..." : "Save changes"}
                    </button>
                    <button className="button button-secondary" type="button" onClick={close}>
                      Close
                    </button>
                  </div>
                  <button
                    className="button button-delete deal-review-delete-trigger"
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    <Trash2 size={16} aria-hidden />
                    Delete the deal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {confirmDeleteOpen ? (
          <div
            className="dialog-backdrop dialog-backdrop--nested"
            role="presentation"
            onMouseDown={() => setConfirmDeleteOpen(false)}
          >
            <div
              className="dialog-panel deal-delete-confirm-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deal-delete-confirm-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h3 className="deal-delete-confirm-panel__title" id="deal-delete-confirm-title">
                Delete this deal?
              </h3>
              <p className="muted deal-delete-confirm-panel__lede">
                This removes the deal and voids related commission entries. This cannot be undone.
              </p>
              <dl className="deal-delete-confirm-panel__meta">
                <div>
                  <dt>Deal</dt>
                  <dd>
                    <strong>{deal.name}</strong>
                    <span className="muted"> · {deal.companyName}</span>
                  </dd>
                </div>
                <div>
                  <dt>Referred by</dt>
                  <dd>
                    {deal.referredByLabel}
                    <br />
                    <span className="muted">{deal.referredByEmail}</span>
                  </dd>
                </div>
              </dl>
              <div className="deal-delete-confirm-panel__actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  Close
                </button>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={isPending}
                  onClick={handleDeleteConfirmed}
                >
                  {isPending ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      ) : null}
    </>
  );
}
