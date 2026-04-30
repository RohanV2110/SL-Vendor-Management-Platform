import { ApplyForm } from "@/components/forms/apply-form";
import { getPortalReferenceData } from "@/lib/services/platform";

type ApplyPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
  }>;
};

export default async function ApplyPage({ searchParams }: ApplyPageProps) {
  const params = searchParams ? await searchParams : {};
  const referralCode = typeof params.ref === "string" ? params.ref.trim().toUpperCase() : undefined;
  const { products, prompts } = await getPortalReferenceData();

  return (
    <main className="landing">
      <section className="hero apply-hero stack-lg">
        <div className="apply-intro">
          <p className="eyebrow">Partner Application</p>
          <h1 className="apply-title">Join the Sugar &amp; Leather AI partner network.</h1>
          <p className="lead">
            Create your login, then complete your partner application.
            We will review and activate your account after approval.
          </p>
        </div>
        <ApplyForm
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          referralCode={referralCode}
          prompts={prompts.map((prompt) => ({
            id: prompt.id,
            label: prompt.label,
            helperText: prompt.helperText
          }))}
        />
      </section>
    </main>
  );
}
