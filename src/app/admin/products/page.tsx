import { createPackageAction, createProductAction } from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { packages: { orderBy: { name: "asc" } } }
  });

  return (
    <div className="stack-lg">
      <SectionCard title="Products and packages" eyebrow="Current catalog">
        <div className="stack-lg">
          {products.map((product) => (
            <div key={product.id} className="note">
              <strong>{product.name}</strong>
              <p className="muted">{product.description}</p>
              <div className="pill-row">
                {product.packages.map((pkg) => (
                  <span className="pill" key={pkg.id}>
                    {pkg.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Create product" eyebrow="Program expansion">
          <form action={createProductAction} className="stack-md">
            <label className="field">
              <span>Name</span>
              <input className="input" name="name" required />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea className="textarea" name="description" />
            </label>
            <SubmitButton label="Create product" pendingLabel="Creating..." />
          </form>
        </SectionCard>

        <SectionCard title="Create package" eyebrow="Product scope">
          <form action={createPackageAction} className="stack-md">
            <label className="field">
              <span>Product</span>
              <select className="select" name="productId" required defaultValue={products[0]?.id}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input className="input" name="name" required />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea className="textarea" name="description" />
            </label>
            <SubmitButton label="Create package" pendingLabel="Creating..." />
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
