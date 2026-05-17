"use client";

import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { AgreementDocumentStatus } from "@prisma/client";
import {
  activatePartnerAction,
  addInternalNoteAction,
  sendDocumentsAction,
  verifyDocumentAction
} from "@/lib/actions";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/utils";

type ApplicationTier = {
  id: string;
  name: string;
};

type ApplicationDetailsDialogProps = {
  tiers: ApplicationTier[];
  application: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    company: string;
    country: string;
    promotionChannels: string;
    aiTechExperience: string;
    audienceDescription: string;
    status: string;
    submittedAt: string;
    adminNotes: string | null;
    product: { name: string } | null;
    assignedTier: { name: string } | null;
    answers: Array<{
      id: string;
      promptSnapshot: string;
      response: string;
    }>;
    notes: Array<{
      id: string;
      body: string;
      author: { name: string };
    }>;
    partnerAccount: {
      id: string;
      company: string;
      primaryContactEmail: string;
      documents: Array<{
        id: string;
        type: string;
        status: AgreementDocumentStatus;
      }>;
    } | null;
  };
};

export function ApplicationDetailsDialog({ application, tiers }: ApplicationDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const partnerAccount = application.partnerAccount;
  const allVerified =
    Boolean(partnerAccount?.documents.length) &&
    partnerAccount!.documents.every((document) => document.status === AgreementDocumentStatus.VERIFIED);

  return (
    <>
      <button
        aria-label={`View details for ${application.fullName || application.email}`}
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
              <div>
                <p className="eyebrow">Application Details</p>
                <h2>{application.fullName || application.email}</h2>
                <p className="muted">{application.email}</p>
              </div>
              <button aria-label="Close details" className="icon-button" type="button" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="dialog-content stack-lg">
              <div className="three-col">
                <p className="note">
                  <strong>Status</strong>
                  <br />
                  <StatusBadge value={application.status} />
                </p>
                <p className="note">
                  <strong>Submitted</strong>
                  <br />
                  {formatDateTime(application.submittedAt)}
                </p>
                <p className="note">
                  <strong>Assigned program</strong>
                  <br />
                  {application.product?.name ?? "Not assigned"}
                  <br />
                  <span className="muted">{application.assignedTier?.name ?? "No internal tier assigned"}</span>
                </p>
              </div>

              <div className="two-col">
                <div className="stack-md">
                  <p className="note">
                    <strong>Contact</strong>
                    <br />
                    {application.phone || "No phone"}
                    <br />
                    {application.country || "No country"}
                    <br />
                    {application.company || "No company"}
                  </p>
                  <p className="note">
                    <strong>Promotional channels</strong>
                    <br />
                    {application.promotionChannels || "No profiles shared"}
                  </p>
                  <p className="note">
                    <strong>Level of experience</strong>
                    <br />
                    {application.aiTechExperience || "Not provided"}
                  </p>
                  <p className="note">
                    <strong>Audience</strong>
                    <br />
                    {application.audienceDescription || "Not provided"}
                  </p>
                </div>
                <div className="stack-md">
                  {application.answers.length ? (
                    application.answers.map((answer) => (
                      <div key={answer.id} className="note">
                        <strong>{answer.promptSnapshot}</strong>
                        <p className="muted">{answer.response}</p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">No subjective answers submitted.</div>
                  )}
                </div>
              </div>

              <div className="two-col">
                <div className="stack-md">
                  <strong>Partner record and documents</strong>
                  {partnerAccount ? (
                    <>
                      <p className="note">
                        <strong>{partnerAccount.company || application.company || application.fullName}</strong>
                        <br />
                        <span className="muted">{partnerAccount.primaryContactEmail}</span>
                      </p>
                      <form action={sendDocumentsAction}>
                        <input type="hidden" name="partnerAccountId" value={partnerAccount.id} />
                        <SubmitButton className="button button-ghost" label="Email signed documents" pendingLabel="Sending..." />
                      </form>
                      {partnerAccount.documents.map((document) => (
                        <div key={document.id} className="note">
                          <div className="inline-form" style={{ justifyContent: "space-between" }}>
                            <strong>{document.type.replace("_", " ")}</strong>
                            <StatusBadge value={document.status} />
                          </div>
                          {document.status !== AgreementDocumentStatus.VERIFIED ? (
                            <form action={verifyDocumentAction} style={{ marginTop: 12 }}>
                              <input type="hidden" name="partnerAccountId" value={partnerAccount.id} />
                              <input type="hidden" name="type" value={document.type} />
                              <SubmitButton className="button button-secondary" label="Mark verified" pendingLabel="Saving..." />
                            </form>
                          ) : null}
                        </div>
                      ))}
                      {allVerified ? (
                        <form action={activatePartnerAction} className="stack-md">
                          <input type="hidden" name="partnerAccountId" value={partnerAccount.id} />
                          <label className="field">
                            <span>Commission tier (required)</span>
                            <select className="select" name="tierId" required>
                              <option value="">Select tier…</option>
                              {tiers.map((tier) => (
                                <option key={tier.id} value={tier.id}>
                                  {tier.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <SubmitButton label="Activate partner" pendingLabel="Activating..." />
                        </form>
                      ) : null}
                    </>
                  ) : (
                    <div className="empty-state">Approve the application to create a partner record.</div>
                  )}
                </div>

                <div className="stack-md">
                  <strong>Internal notes</strong>
                  {application.notes.map((note) => (
                    <div className="note" key={note.id}>
                      <strong>{note.author.name}</strong>
                      <p className="muted">{note.body}</p>
                    </div>
                  ))}
                  <form action={addInternalNoteAction} className="stack-md">
                    <input type="hidden" name="entityType" value="APPLICATION" />
                    <input type="hidden" name="entityId" value={application.id} />
                    <textarea className="textarea" name="body" placeholder="Add internal context" required />
                    <SubmitButton className="button button-secondary" label="Add note" pendingLabel="Saving..." />
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
