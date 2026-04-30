"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { getSession, signIn } from "next-auth/react";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [message, setMessage] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setMessage(undefined);
      const result = await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirect: false,
        callbackUrl: redirectTo ?? "/"
      });

      if (result?.error) {
        setMessage("Invalid email or password.");
        return;
      }

      const session = await getSession();
      const role = session?.user?.role;
      const nextUrl =
        redirectTo ??
        (role === "ADMIN" ? "/admin" : role === "PARTNER" ? "/partner/dashboard" : result?.url ?? "/");

      window.location.href = nextUrl;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="stack-md login-form">
      <input type="hidden" name="redirectTo" value={redirectTo ?? "/"} />
      <label className="field">
        <span>Email</span>
        <input className="input" type="email" name="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" name="password" required />
      </label>
      {message ? <p className="form-message">{message}</p> : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <p className="login-apply-copy">
        Need a partner account? <Link href="/apply">Apply here</Link>.
      </p>
    </form>
  );
}
