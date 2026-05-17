"use client";

import { COUNTRIES } from "@/lib/locations";
import type { PartnerDealFormState } from "@/lib/actions";

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
  dealValue: string | null;
};

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

type PartnerDealFormFieldsProps = {
  existing?: PartnerDealEditable | null;
  country: string;
  setCountry: (value: string) => void;
  dialCode: string;
  setDialCode: (value: string) => void;
  getFieldError: (field: keyof NonNullable<PartnerDealFormState["fieldErrors"]>) => string | undefined;
  isEdit: boolean;
  actorRole: "PARTNER" | "ADMIN";
};

export function PartnerDealFormFields({
  existing,
  country,
  setCountry,
  dialCode,
  setDialCode,
  getFieldError,
  isEdit,
  actorRole
}: PartnerDealFormFieldsProps) {
  return (
    <>
      <div className="two-col">
        <label className="field">
          <span>Name</span>
          <input className="input" name="name" defaultValue={existing?.name ?? ""} required />
          {getFieldError("name") ? <small className="form-message">{getFieldError("name")}</small> : null}
        </label>
        <label className="field">
          <span>Business email</span>
          <input
            className="input"
            type="email"
            name="email"
            defaultValue={existing?.email ?? ""}
            required
          />
          {getFieldError("email") ? <small className="form-message">{getFieldError("email")}</small> : null}
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
          <span>Business website</span>
          <input
            className="input"
            name="website"
            type="url"
            placeholder="https://example.com"
            defaultValue={existing?.website ?? ""}
            required
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
          {getFieldError("phone") ? <small className="form-message">{getFieldError("phone")}</small> : null}
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
          <input className="input" name="state" defaultValue={existing?.state ?? ""} required />
          {getFieldError("state") ? <small className="form-message">{getFieldError("state")}</small> : null}
        </label>
        {isEdit && actorRole === "ADMIN" ? (
          <label className="field">
            <span>Deal value (USD)</span>
            <input
              className="input"
              name="dealValue"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 1500"
              defaultValue={existing?.dealValue ?? ""}
            />
            <small className="muted">Drives commission via the partner&apos;s tier rule.</small>
            {getFieldError("dealValue") ? (
              <small className="form-message">{getFieldError("dealValue")}</small>
            ) : null}
          </label>
        ) : null}
      </div>

      <label className="field">
        <span>Note</span>
        <textarea className="textarea" name="notes" defaultValue={existing?.notes ?? ""} rows={4} />
        {getFieldError("notes") ? <small className="form-message">{getFieldError("notes")}</small> : null}
      </label>
    </>
  );
}
