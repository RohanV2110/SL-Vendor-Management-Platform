"use client";

import { useActionState } from "react";
import { completeInviteAction } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

export function InviteForm({ token }: { token: string }) {
  const [message, action] = useActionState(completeInviteAction, undefined);

  return (
    <form action={action} className="stack-md">
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span>Create password</span>
        <input className="input" type="password" name="password" minLength={8} required />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input className="input" type="password" name="confirmPassword" minLength={8} required />
      </label>
      {message ? <p className="form-message">{message}</p> : null}
      <SubmitButton label="Activate login" pendingLabel="Activating..." />
    </form>
  );
}
