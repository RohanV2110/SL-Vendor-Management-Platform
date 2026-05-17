"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import {
  createPartnerDealAction,
  updatePartnerDealAction,
  type PartnerDealFormState
} from "@/lib/actions";
import { PartnerDealFormFields, type PartnerDealEditable } from "@/components/partner-deal-form-fields";

export type { PartnerDealEditable };

const initialState: PartnerDealFormState = { status: "idle" };

type PartnerDealDialogProps = {
  mode: "create" | "edit";
  triggerLabel?: string;
  triggerClassName?: string;
  triggerVariant?: "default" | "icon";
  disabled?: boolean;
  actorRole?: "PARTNER" | "ADMIN";
  existing?: PartnerDealEditable;
};

export function PartnerDealDialog({
  mode,
  triggerLabel,
  triggerClassName,
  triggerVariant = "default",
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
  const useIconTrigger = triggerVariant === "icon";

  return (
    <>
      <button
        aria-label={useIconTrigger ? (isEdit ? "Edit deal" : "Add deal") : undefined}
        className={useIconTrigger ? "icon-button" : (triggerClassName ?? defaultTriggerClass)}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-disabled={disabled || undefined}
      >
        {useIconTrigger ? <Pencil size={18} /> : (triggerLabel ?? defaultTriggerLabel)}
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

                <PartnerDealFormFields
                  existing={existing}
                  country={country}
                  setCountry={setCountry}
                  dialCode={dialCode}
                  setDialCode={setDialCode}
                  getFieldError={getFieldError}
                  isEdit={isEdit}
                  actorRole={actorRole}
                />

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
                  <button className="button button-secondary" type="button" onClick={close}>
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
