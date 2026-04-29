import Link from "next/link";
import { LoginForm } from "@/components/forms/login-form";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ redirectTo?: string; applied?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirectTo;
  const applied = params.applied === "1";

  return (
    <main className="landing">
      <section className="hero" style={{ maxWidth: 520 }}>
        <div className="stack-lg">
          <div>
            <p className="eyebrow">Sign in</p>
            <h1>Access the partner platform.</h1>
            <p className="lead">
              Admins and approved partners use the same credentials-based login. New partner users
              should apply first, create their password during application, then log in to track
              onboarding.
            </p>
          </div>
          {applied ? (
            <p className="note">
              Your account was created and your application was submitted. You can log in now to
              track onboarding status.
            </p>
          ) : null}
          <LoginForm redirectTo={redirectTo} />
          <div className="button-row">
            <Link className="button button-secondary" href="/apply">
              Apply as a partner
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
