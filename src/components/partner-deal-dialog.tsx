"use client";

import { useState, useTransition } from "react";
import {
  createPartnerDealAction,
  updatePartnerDealAction,
  type PartnerDealFormState
} from "@/lib/actions";
import { COUNTRIES } from "@/lib/locations";

const initialState: PartnerDealFormState = { status: "idle" };

const dialOptions = (() => {
  const seen = new Set<string>();
  return COUNTRIES.flatMap((country) => {
    const key = `${country.dialCode}-${country.iso}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        value: country.dialCode,
        label: `${country.dialCode} (${country.iso})`
      }
    ];
  }).sort((a, b) => a.label.localeCompare(b.label));
})();

export type PartnerDealEditable = {
  id: string;
  name: string;
  email: string;
  companyName: string;
  website: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  country: string;
  state: string;
  notes: string | null;
};

type PartnerDealDialogProps = {
  mode: "create" | "edit";
  triggerLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
  actorRole?: "PARTNER" | "ADMIN";
  existing?: PartnerDealEditable;
};

export function PartnerDealDialog({
  mode,
  triggerLabel,
  triggerClassName,
  disabled = false,
  actorRole = "PARTNER",
  existing
}: PartnerDealDialogProps) {
  const isEdit = mode === "edit";
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(existing?.country ?? "");
  const [dialCode, setDialCode] = useState(existing?.phoneCountryCode ?? "");
  const [state, setState] = useState<PartnerDealFormState>(initialState);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setCountry(existing?.country ?? "");
    setDialCode(existing?.phoneCountryCode ?? "");
    setState(initialState);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = isEdit
        ? await updatePartnerDealAction(state, formData)
        : await createPartnerDealAction(state, formData);
      setState(result);
      if (result.status === "success") {
        setOpen(false);
        if (!isEdit) {
          setCountry("");
          setDialCode("");
        }
      }
    });
  }

  function getFieldError(field: keyof NonNullable<PartnerDealFormState["fieldErrors"]>) {
    return state.fieldErrors?.[field];
  }

  const defaultTriggerLabel = isEdit ? "Edit" : "Add Deal";
  const defaultTriggerClass = isEdit ? "button button-secondary" : "button";

  return (
    <>
      <button
        className={triggerClassName ?? defaultTriggerClass}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-disabled={disabled || undefined}
      >
        {triggerLabel ?? defaultTriggerLabel}
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
          <div
            className="dialog-panel add-affiliate-panel"
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? "Edit deal" : "Add deal"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Deal</p>
                <h2>{isEdit ? "Edit deal" : "Add deal"}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={close}>
                ×
              </button>
            </div>
            <div className="dialog-content">
              <form action={handleSubmit} className="stack-lg">
                {isEdit && existing ? (
                  <>
                    <input type="hidden" name="dealId" value={existing.id} />
                    <input type="hidden" name="actorRole" value={actorRole} />
                  </>
                ) : null}

                {state.status === "error" && state.error ? (
                  <div className="form-message" role="alert">
                    {state.error}
                  </div>
                ) : null}

                <div className="two-col">
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="input"
                      name="name"
                      defaultValue={existing?.name ?? ""}
                      required
                    />
                    {getFieldError("name") ? (
                      <small className="form-message">{getFieldError("name")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      className="input"
                      type="email"
                      name="email"
                      defaultValue={existing?.email ?? ""}
                      required
                    />
                    {getFieldError("email") ? (
                      <small className="form-message">{getFieldError("email")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Company name</span>
                    <input
                      className="input"
                      name="companyName"
                      defaultValue={existing?.companyName ?? ""}
                      required
                    />
                    {getFieldError("companyName") ? (
                      <small className="form-message">{getFieldError("companyName")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Website (optional)</span>
                    <input
                      className="input"
                      name="website"
                      type="url"
                      placeholder="https://example.com"
                      defaultValue={existing?.website ?? ""}
                    />
                    {getFieldError("website") ? (
                      <small className="form-message">{getFieldError("website")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Mobile number (optional)</span>
                    <div className="phone-row">
                      <select
                        className="select phone-row__code"
                        name="phoneCountryCode"
                        value={dialCode}
                        onChange={(event) => setDialCode(event.target.value)}
                        aria-label="Country code"
                      >
                        <option value="">Code</option>
                        {dialOptions.map((option) => (
                          <option key={option.label} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input phone-row__number"
                        name="phoneNumber"
                        type="tel"
                        inputMode="numeric"
                        pattern="\d{10}"
                        maxLength={10}
                        placeholder="10-digit number"
                        defaultValue={existing?.phoneNumber ?? ""}
                      />
                    </div>
                    {getFieldError("phone") ? (
                      <small className="form-message">{getFieldError("phone")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Country</span>
                    <select
                      className="select"
                      name="country"
                      value={country}
                      onChange={(event) => setCountry(event.target.value)}
                      required
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map((entry) => (
                        <option key={entry.iso} value={entry.name}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                    {getFieldError("country") ? (
                      <small className="form-message">{getFieldError("country")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>State</span>
                    <input
                      className="input"
                      name="state"
                      defaultValue={existing?.state ?? ""}
                      required
                    />
                    {getFieldError("state") ? (
                      <small className="form-message">{getFieldError("state")}</small>
                    ) : null}
                  </label>
                </div>

                <label className="field">
                  <span>Note</span>
                  <textarea
                    className="textarea"
                    name="notes"
                    defaultValue={existing?.notes ?? ""}
                    rows={4}
                  />
                  {getFieldError("notes") ? (
                    <small className="form-message">{getFieldError("notes")}</small>
                  ) : null}
                </label>

                <div className="button-row">
                  <button className="button" type="submit" disabled={isPending}>
                    {isPending
                      ? isEdit
                        ? "Saving..."
                        : "Adding..."
                      : isEdit
                        ? "Save changes"
                        : "Add deal"}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={close}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
