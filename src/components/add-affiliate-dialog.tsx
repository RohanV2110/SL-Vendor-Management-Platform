"use client";

import { useState } from "react";
import { createAffiliateAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

const socialFields = ["LinkedIn", "X / Twitter", "YouTube", "Instagram", "TikTok", "Website"];

export function AddAffiliateDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>
        Add Affiliate
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog-panel add-affiliate-panel" role="dialog" aria-modal="true" aria-label="Add affiliate">
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Affiliate</p>
                <h2>Add affiliate</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="dialog-content">
              <form action={createAffiliateAction} className="stack-lg">
                <div className="two-col">
                  <label className="field">
                    <span>Name</span>
                    <input className="input" name="name" required />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input className="input" type="email" name="email" required />
                  </label>
                  <label className="field">
                    <span>Company name</span>
                    <input className="input" name="company" />
                  </label>
                  <label className="field">
                    <span>Mobile number</span>
                    <input className="input" name="phone" />
                  </label>
                </div>

                <div className="stack-md">
                  <div>
                    <strong>Social media links</strong>
                  </div>
                  <div className="three-col">
                    {socialFields.map((field) => (
                      <label className="field" key={field}>
                        <span>{field}</span>
                        <input className="input" name={field} />
                      </label>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span>Notes</span>
                  <textarea className="textarea" name="notes" />
                </label>

                <div className="button-row">
                  <SubmitButton label="Add" pendingLabel="Adding..." />
                  <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>
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
