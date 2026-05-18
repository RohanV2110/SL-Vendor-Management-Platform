"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createCommissionAction, type CreateCommissionState } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

const newEntryTypes = ["UPFRONT", "TRAILING", "ADJUSTMENT"] as const;
const newEntryStatuses = ["APPROVED", "SCHEDULED", "PAYABLE", "PAID"] as const;

const initialState: CreateCommissionState = { status: "idle" };

export type AdminAddCommissionPartnerOption = {
  id: string;
  company: string;
};

type AdminAddCommissionDialogProps = {
  partners: AdminAddCommissionPartnerOption[];
};

export function AdminAddCommissionDialog({ partners }: AdminAddCommissionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CreateCommissionState>(initialState);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setState(initialState);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  function handleCreateCommission(formData: FormData) {
    startTransition(async () => {
      const result = await createCommissionAction(state, formData);
      setState(result);
      if (result.status === "success") {
        setOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="button"
        disabled={partners.length === 0}
        title={partners.length === 0 ? "No partners available yet" : undefined}
        onClick={() => setOpen(true)}
      >
        Add commission
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
          <div
            className="dialog-panel add-affiliate-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-commission-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Manual ledger entry</p>
                <h2 id="add-commission-dialog-title">Add commission</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={close}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-content stack-md">
              {partners.length === 0 ? (
                <div className="empty-state">
                  No partners available yet. Create a partner before adding a manual commission.
                </div>
              ) : (
                <form action={handleCreateCommission} className="stack-md">
                  {state.status === "error" && state.error ? (
                    <div className="form-message" role="alert">
                      {state.error}
                    </div>
                  ) : null}

                  <div className="two-col">
                    <label className="field">
                      <span>Partner</span>
                      <select className="select" name="partnerAccountId" required defaultValue="">
                        <option value="" disabled>
                          Select a partner
                        </option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.company}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Type</span>
                      <select className="select" name="type" defaultValue="UPFRONT" required>
                        {newEntryTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="two-col">
                    <label className="field">
                      <span>Amount (USD)</span>
                      <input
                        className="input"
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="e.g. 250.00"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select className="select" name="status" defaultValue="APPROVED">
                        {newEntryStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Scheduled for (optional)</span>
                    <input className="input" name="scheduledFor" type="date" />
                  </label>

                  <label className="field">
                    <span>Description</span>
                    <input
                      className="input"
                      name="description"
                      placeholder="What is this commission for?"
                      required
                    />
                  </label>

                  <SubmitButton
                    className="button"
                    label="Add commission"
                    pendingLabel="Saving..."
                    disabled={isPending}
                  />
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
