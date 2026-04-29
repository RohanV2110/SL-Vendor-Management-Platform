import { InviteForm } from "@/components/forms/invite-form";

export default async function SetupLoginPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;

  if (!token) {
    return (
      <main className="landing">
        <section className="hero" style={{ maxWidth: 520 }}>
          <p className="note">A valid invite token is required to activate partner login.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="landing">
      <section className="hero" style={{ maxWidth: 520 }}>
        <div className="stack-lg">
          <div>
            <p className="eyebrow">Create credentials</p>
            <h1>Set your partner password.</h1>
            <p className="lead">This activates portal access so you can monitor onboarding status and track referrals after approval.</p>
          </div>
          <InviteForm token={token} />
        </div>
      </section>
    </main>
  );
}
