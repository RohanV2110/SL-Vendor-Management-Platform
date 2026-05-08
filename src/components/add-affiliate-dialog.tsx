"use client";

import { useMemo, useState, useTransition } from "react";
import { createAffiliateAction, type CreateAffiliateState } from "@/lib/actions";
import { COUNTRIES, findCountryByName } from "@/lib/locations";

const socialFields = ["LinkedIn", "X / Twitter", "YouTube", "Instagram", "TikTok", "Website"];

const initialState: CreateAffiliateState = { status: "idle" };

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

export function AddAffiliateDialog() {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [dialCode, setDialCode] = useState("");
  const [state, setState] = useState<CreateAffiliateState>(initialState);
  const [isPending, startTransition] = useTransition();

  const cityOptions = useMemo(() => {
    const entry = findCountryByName(country);
    return entry?.cities ?? [];
  }, [country]);

  function resetForm() {
    setCountry("");
    setCity("");
    setDialCode("");
    setState(initialState);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createAffiliateAction(state, formData);
      setState(result);
      if (result.status === "success") {
        setOpen(false);
        setCountry("");
        setCity("");
        setDialCode("");
      }
    });
  }

  function handleCountryChange(value: string) {
    setCountry(value);
    setCity("");
  }

  function getFieldError(field: keyof NonNullable<CreateAffiliateState["fieldErrors"]>) {
    return state.fieldErrors?.[field];
  }

  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>
        Add Affiliate
      </button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
          <div
            className="dialog-panel add-affiliate-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Add affiliate"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Affiliate</p>
                <h2>Add affiliate</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={close}>
                ×
              </button>
            </div>
            <div className="dialog-content">
              <form action={handleSubmit} className="stack-lg">
                {state.status === "error" && state.error ? (
                  <div className="form-message" role="alert">
                    {state.error}
                  </div>
                ) : null}

                <div className="two-col">
                  <label className="field">
                    <span>Name</span>
                    <input className="input" name="name" required />
                    {getFieldError("name") ? (
                      <small className="form-message">{getFieldError("name")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input className="input" type="email" name="email" required />
                    {getFieldError("email") ? (
                      <small className="form-message">{getFieldError("email")}</small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Company name</span>
                    <input className="input" name="company" />
                  </label>
                  <label className="field">
                    <span>Mobile number (optional)</span>
                    <div className="inline-form">
                      <select
                        className="select"
                        name="phoneCountryCode"
                        value={dialCode}
                        onChange={(event) => setDialCode(event.target.value)}
                        style={{ maxWidth: 130 }}
                      >
                        <option value="">Code</option>
                        {dialOptions.map((option) => (
                          <option key={option.label} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        name="phoneNumber"
                        type="tel"
                        inputMode="numeric"
                        pattern="\d{10}"
                        maxLength={10}
                        placeholder="10-digit number"
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
                      onChange={(event) => handleCountryChange(event.target.value)}
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
                    <span>City</span>
                    <select
                      className="select"
                      name="city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      disabled={cityOptions.length === 0}
                    >
                      <option value="">
                        {cityOptions.length === 0 ? "Select a country first" : "Select a city"}
                      </option>
                      {cityOptions.map((cityName) => (
                        <option key={cityName} value={cityName}>
                          {cityName}
                        </option>
                      ))}
                    </select>
                    {getFieldError("city") ? (
                      <small className="form-message">{getFieldError("city")}</small>
                    ) : null}
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
                  <button className="button" type="submit" disabled={isPending}>
                    {isPending ? "Adding..." : "Add"}
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
