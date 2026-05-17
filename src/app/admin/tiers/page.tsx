import { createTierAction, deleteTierAction, updateTierAction } from "@/lib/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";

function formatRuleValue(type: string, value: string) {
  return type === "PERCENTAGE" ? `${value}%` : `$${value}`;
}

export default async function AdminTiersPage() {
  const [tiers, products] = await Promise.all([
    prisma.tier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            partners: true,
            agreements: true,
            applications: true
          }
        },
        rules: {
          include: {
            product: true,
            package: true
          }
        }
      }
    }),
    prisma.product.findMany({
      include: {
        packages: true
      },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <div className="stack-lg">
      <SectionCard title="Tier catalog" eyebrow="Default and custom programs">
        <div className="stack-lg">
          {tiers.map((tier) => (
            <div key={tier.id} className="panel" style={{ boxShadow: "none" }}>
              <div className="panel-body stack-md">
                <strong>{tier.name}</strong>
                <p className="muted">{tier.description}</p>
                <p className="muted">
                  {tier._count.partners} partners · {tier._count.applications} assigned applications ·{" "}
                  {tier.isActive ? "Active" : "Inactive"}
                </p>
                {tier.rules.map((rule) => (
                  <p className="note" key={rule.id}>
                    {rule.product?.name ?? "All products"} · {rule.package?.name ?? "All packages"}
                    <br />
                    Upfront {rule.upfrontCommissionType}: {formatRuleValue(rule.upfrontCommissionType, rule.upfrontCommissionValue.toString())}
                    <br />
                    Trailing{" "}
                    {rule.trailingCommissionType && rule.trailingCommissionValue
                      ? formatRuleValue(rule.trailingCommissionType, rule.trailingCommissionValue.toString())
                      : "—"}
                    <br />
                    Quarterly minimums: {rule.quarterlyApprovedReferralsMin ?? 0} approved referrals / {rule.quarterlyConvertedDealsMin ?? 0} converted deals
                  </p>
                ))}
                <form action={updateTierAction} className="three-col">
                  <input type="hidden" name="tierId" value={tier.id} />
                  <label className="field">
                    <span>Name</span>
                    <input className="input" name="name" defaultValue={tier.name} required />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <input className="input" name="description" defaultValue={tier.description ?? ""} />
                  </label>
                  <label className="field">
                    <span>Product</span>
                    <select className="select" name="productId" defaultValue={tier.rules[0]?.productId ?? ""}>
                      <option value="">All products</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Package</span>
                    <select className="select" name="packageId" defaultValue={tier.rules[0]?.packageId ?? ""}>
                      <option value="">All packages</option>
                      {products.flatMap((product) =>
                        product.packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {product.name} · {pkg.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="field">
                    <span>Upfront type</span>
                    <select className="select" name="upfrontCommissionType" defaultValue={tier.rules[0]?.upfrontCommissionType ?? "PERCENTAGE"}>
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FIXED">Fixed</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Upfront value</span>
                    <input className="input" name="upfrontCommissionValue" type="number" step="0.01" min="0" defaultValue={tier.rules[0]?.upfrontCommissionValue.toString() ?? "0"} required />
                  </label>
                  <label className="field">
                    <span>Trailing type</span>
                    <select className="select" name="trailingCommissionType" defaultValue={tier.rules[0]?.trailingCommissionType ?? "PERCENTAGE"}>
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FIXED">Fixed</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Trailing value</span>
                    <input className="input" name="trailingCommissionValue" type="number" step="0.01" min="0" defaultValue={tier.rules[0]?.trailingCommissionValue?.toString() ?? ""} />
                  </label>
                  <label className="field">
                    <span>Trailing months</span>
                    <input className="input" name="trailingDurationMonths" type="number" min="0" defaultValue={tier.rules[0]?.trailingDurationMonths ?? ""} />
                  </label>
                  <label className="field">
                    <span>Trailing cadence</span>
                    <input className="input" name="trailingCadenceMonths" type="number" min="1" defaultValue={tier.rules[0]?.trailingCadenceMonths ?? ""} />
                  </label>
                  <label className="field">
                    <span>Clawback window days</span>
                    <input className="input" name="clawbackWindowDays" type="number" min="0" defaultValue={tier.rules[0]?.clawbackWindowDays ?? ""} />
                  </label>
                  <label className="field">
                    <span>Quarterly approved referrals</span>
                    <input className="input" name="quarterlyApprovedReferralsMin" type="number" min="0" defaultValue={tier.rules[0]?.quarterlyApprovedReferralsMin ?? ""} />
                  </label>
                  <label className="field">
                    <span>Quarterly converted deals</span>
                    <input className="input" name="quarterlyConvertedDealsMin" type="number" min="0" defaultValue={tier.rules[0]?.quarterlyConvertedDealsMin ?? ""} />
                  </label>
                  <label className="field">
                    <span>Quarterly revenue minimum</span>
                    <input className="input" name="quarterlyRevenueMin" type="number" min="0" step="0.01" defaultValue={tier.rules[0]?.quarterlyRevenueMin?.toString() ?? ""} />
                  </label>
                  <label className="field">
                    <span>Quarterly commission minimum</span>
                    <input className="input" name="quarterlyCommissionMin" type="number" min="0" step="0.01" defaultValue={tier.rules[0]?.quarterlyCommissionMin?.toString() ?? ""} />
                  </label>
                  <div className="button-row tier-form-footer-actions">
                    <SubmitButton className="button button-secondary" label="Save" pendingLabel="Saving..." />
                    <ConfirmSubmitButton
                      formAction={deleteTierAction}
                      className="button button-delete table-action-button"
                      label="Delete tier"
                      confirmMessage="Are you sure you want to delete this tier? This action cannot be undone."
                    />
                  </div>
                </form>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Create custom tier" eyebrow="Admin-managed commission rules">
        <form action={createTierAction} className="three-col">
          <label className="field">
            <span>Name</span>
            <input className="input" name="name" required />
          </label>
          <label className="field">
            <span>Description</span>
            <input className="input" name="description" />
          </label>
          <label className="field">
            <span>Product</span>
            <select className="select" name="productId">
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Package</span>
            <select className="select" name="packageId">
              <option value="">All packages</option>
              {products.flatMap((product) =>
                product.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {product.name} · {pkg.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="field">
            <span>Upfront type</span>
            <select className="select" name="upfrontCommissionType" defaultValue="PERCENTAGE">
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed</option>
            </select>
          </label>
          <label className="field">
            <span>Upfront value</span>
            <input className="input" name="upfrontCommissionValue" type="number" step="0.01" min="0" required />
          </label>
          <label className="field">
            <span>Trailing type</span>
            <select className="select" name="trailingCommissionType" defaultValue="PERCENTAGE">
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed</option>
            </select>
          </label>
          <label className="field">
            <span>Trailing value</span>
            <input className="input" name="trailingCommissionValue" type="number" step="0.01" min="0" />
          </label>
          <label className="field">
            <span>Trailing months</span>
            <input className="input" name="trailingDurationMonths" type="number" min="0" />
          </label>
          <label className="field">
            <span>Trailing cadence</span>
            <input className="input" name="trailingCadenceMonths" type="number" min="1" />
          </label>
          <label className="field">
            <span>Clawback window days</span>
            <input className="input" name="clawbackWindowDays" type="number" min="0" />
          </label>
          <label className="field">
            <span>Quarterly approved referrals</span>
            <input className="input" name="quarterlyApprovedReferralsMin" type="number" min="0" />
          </label>
          <label className="field">
            <span>Quarterly converted deals</span>
            <input className="input" name="quarterlyConvertedDealsMin" type="number" min="0" />
          </label>
          <label className="field">
            <span>Quarterly revenue minimum</span>
            <input className="input" name="quarterlyRevenueMin" type="number" min="0" step="0.01" />
          </label>
          <label className="field">
            <span>Quarterly commission minimum</span>
            <input className="input" name="quarterlyCommissionMin" type="number" min="0" step="0.01" />
          </label>
          <div className="field" style={{ alignSelf: "end" }}>
            <SubmitButton label="Create tier" pendingLabel="Creating..." />
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
