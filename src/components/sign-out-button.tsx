"use client";

import { useTransition } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="button button-secondary"
      type="button"
      onClick={() => startTransition(() => signOut({ callbackUrl: "/" }))}
      disabled={pending}
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
