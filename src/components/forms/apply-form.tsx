"use client";

import { useActionState, useState } from "react";
import { submitApplicationAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

type ProductOption = {
  id: string;
  name: string;
};

type PromptOption = {
  id: string;
  label: string;
  helperText: string | null;
};

type ApplyFormProps = {
  products: ProductOption[];
  prompts: PromptOption[];
  referralCode?: string;
};

export function ApplyForm({ products, prompts, referralCode }: ApplyFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [message, action] = useActionState(submitApplicationAction, undefined);
  const [registration, setRegistration] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [registrationError, setRegistrationError] = useState<string | undefined>();
  const [socialProfiles, setSocialProfiles] = useState({
    linkedin: "",
    x: "",
    youtube: "",
    instagram: "",
    tiktok: "",
    website: ""
  });

  function continueToQuestions() {
    if (!registration.fullName.trim()) {
      setRegistrationError("Name is required.");
      return;
    }

    if (!registration.email.trim()) {
      setRegistrationError("Email is required.");
      return;
    }

    if (registration.password.length < 8) {
      setRegistrationError("Password must be at least 8 characters.");
      return;
    }

    if (registration.password !== registration.confirmPassword) {
      setRegistrationError("Passwords do not match.");
      return;
    }

    setRegistrationError(undefined);
    setStep(2);
  }

  return (
    <form action={action} className="stack-lg">
      {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}
      {step === 1 ? (
        <div className="stack-lg">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Create your login</h2>
            <p className="lead">Register first with your name, email, and password.</p>
          </div>
          <div className="two-col">
            <label className="field">
              <span>Full name</span>
              <input
                className="input"
                name="fullName"
                value={registration.fullName}
                onChange={(event) => setRegistration((current) => ({ ...current, fullName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                name="email"
                value={registration.email}
                onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                name="password"
                value={registration.password}
                onChange={(event) => setRegistration((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                className="input"
                type="password"
                name="confirmPassword"
                value={registration.confirmPassword}
                onChange={(event) => setRegistration((current) => ({ ...current, confirmPassword: event.target.value }))}
                required
              />
            </label>
          </div>
          {referralCode ? (
            <div className="note">
              <strong>Vendor referral code applied</strong>
              <p className="muted">{referralCode}</p>
            </div>
          ) : null}
          {registrationError ? <p className="form-message">{registrationError}</p> : null}
          <div className="button-row">
            <button className="button" type="button" onClick={continueToQuestions}>
              Continue to questions
            </button>
          </div>
        </div>
      ) : (
        <div className="stack-lg">
          <input type="hidden" name="fullName" value={registration.fullName} />
          <input type="hidden" name="email" value={registration.email} />
          <input type="hidden" name="password" value={registration.password} />
          <input type="hidden" name="confirmPassword" value={registration.confirmPassword} />
          <input
            type="hidden"
            name="promotionChannels"
            value={Object.entries(socialProfiles)
              .filter(([, value]) => value.trim().length > 0)
              .map(([platform, value]) => `${platform}: ${value.trim()}`)
              .join("\n")}
          />
          <div className="inline-form" style={{ justifyContent: "space-between" }}>
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Tell us about your fit</h2>
              <p className="lead">Complete the partner application after registering your login.</p>
            </div>
            <button className="button button-secondary" type="button" onClick={() => setStep(1)}>
              Back to registration
            </button>
          </div>
          <div className="two-col">
            <label className="field">
              <span>Phone</span>
              <input className="input" name="phone" />
            </label>
            <label className="field">
              <span>Company</span>
              <input className="input" name="company" />
            </label>
            <label className="field">
              <span>Country</span>
              <input className="input" name="country" />
            </label>
            <label className="field">
              <span>Product</span>
              <select className="select" name="productId" defaultValue="">
                <option value="">Select later</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="stack-md">
            <div>
              <strong>Promotional channels</strong>
              <p className="muted" style={{ marginTop: 8 }}>
                The more profiles you share, the better we can understand how and where we can support you.
              </p>
            </div>
            <div className="three-col">
              <label className="field">
                <span>LinkedIn</span>
                <input
                  className="input"
                  value={socialProfiles.linkedin}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, linkedin: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>X / Twitter</span>
                <input
                  className="input"
                  value={socialProfiles.x}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, x: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>YouTube</span>
                <input
                  className="input"
                  value={socialProfiles.youtube}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, youtube: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Instagram</span>
                <input
                  className="input"
                  value={socialProfiles.instagram}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, instagram: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>TikTok</span>
                <input
                  className="input"
                  value={socialProfiles.tiktok}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, tiktok: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Website / Newsletter</span>
                <input
                  className="input"
                  value={socialProfiles.website}
                  onChange={(event) => setSocialProfiles((current) => ({ ...current, website: event.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="two-col">
            <label className="field">
              <span>Level of experience</span>
              <select className="select" name="aiTechExperience" defaultValue="">
                <option value="">Select your experience level</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Expert">Expert</option>
              </select>
            </label>
            <label className="field">
              <span>Audience description</span>
              <textarea className="textarea" name="audienceDescription" />
            </label>
          </div>
          <div className="three-col">
            {prompts.map((prompt) => (
              <label key={prompt.id} className="field">
                <input type="hidden" name="promptId" value={prompt.id} />
                <span>{prompt.label}</span>
                <textarea className="textarea" name={`answer_${prompt.id}`} />
                {prompt.helperText ? <small className="muted">{prompt.helperText}</small> : null}
              </label>
            ))}
          </div>
          {message ? <p className="form-message">{message}</p> : null}
          <SubmitButton label="Create account and submit application" pendingLabel="Submitting..." />
        </div>
      )}
    </form>
  );
}
