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
      <section className="hero login-hero" style={{ maxWidth: 520 }}>
        <div className="stack-lg">
          <div className="login-intro">
            <p className="eyebrow">Sign in</p>
            <h1 className="login-title">Access the partner platform.</h1>
            <p className="lead">Sign in to continue. New here? Register first.</p>
          </div>
          {applied ? (
            <p className="note">
              Your account was created and your application was submitted. You can log in now to
              track onboarding status.
            </p>
          ) : null}
          <LoginForm redirectTo={redirectTo} />
        </div>
      </section>
    </main>
  );
}
