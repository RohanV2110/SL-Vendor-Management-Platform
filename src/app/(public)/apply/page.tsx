import { ApplyForm } from "@/components/forms/apply-form";
import { getPortalReferenceData } from "@/lib/services/platform";

export default async function ApplyPage() {
  const { products, prompts } = await getPortalReferenceData();

  return (
    <main className="landing">
      <section className="hero stack-lg">
        <div>
          <p className="eyebrow">Partner Application</p>
          <h1>Join the Sugar &amp; Leather AI partner network.</h1>
          <p className="lead">
            Create your login first, then complete the partner application. Admin review,
            NDA/agreement handling, and activation still happen inside the platform.
          </p>
        </div>
        <ApplyForm
          products={products.map((product) => ({ id: product.id, name: product.name }))}
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
