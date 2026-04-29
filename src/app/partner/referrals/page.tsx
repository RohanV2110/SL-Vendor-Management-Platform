import { createReferralAction } from "@/lib/actions";
import { PartnerAccountStatus } from "@prisma/client";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getPortalReferenceData } from "@/lib/services/platform";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function PartnerReferralsPage() {
  const user = await requireRole("PARTNER");
  const partnerId = user.partnerAccountId!;

  const [partner, { products }, referrals] = await Promise.all([
    prisma.partnerAccount.findUniqueOrThrow({
      where: { id: partnerId },
      select: { status: true }
    }),
    getPortalReferenceData(),
    prisma.referral.findMany({
      where: { partnerAccountId: partnerId },
      include: {
        product: true,
        package: true
      },
      orderBy: { submittedAt: "desc" }
    })
  ]);

  return (
    <div className="stack-lg">
      <SectionCard title="Submit a referral" eyebrow="Immutable after submit">
        {partner.status !== PartnerAccountStatus.ACTIVE ? (
          <div className="empty-state">
            Your partner account is still {partner.status.toLowerCase().replaceAll("_", " ")}. Referral
            submission unlocks after admin activation and signed document verification.
          </div>
        ) : (
          <form action={createReferralAction} className="stack-lg">
            <div className="three-col">
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
                <span>Package</span>
                <select className="select" name="packageId" defaultValue="">
                  <option value="">Optional package</option>
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
                <span>Estimated deal value</span>
                <input className="input" name="estimatedDealValue" type="number" min="0" step="0.01" />
              </label>
              <label className="field">
                <span>Company</span>
                <input className="input" name="referredCompany" required />
              </label>
              <label className="field">
                <span>Contact name</span>
                <input className="input" name="referredContactName" required />
              </label>
              <label className="field">
                <span>Contact email</span>
                <input className="input" type="email" name="referredContactEmail" />
              </label>
              <label className="field">
                <span>Domain</span>
                <input className="input" name="referredDomain" placeholder="company.com" />
              </label>
              <label className="field">
                <span>Attachment</span>
                <input className="input" type="file" name="attachment" />
              </label>
            </div>
            <label className="field">
              <span>Source notes</span>
              <textarea className="textarea" name="sourceNotes" required />
            </label>
            <label className="field">
              <span>Expected use case</span>
              <textarea className="textarea" name="useCaseSummary" required />
            </label>
            <SubmitButton label="Submit referral" pendingLabel="Submitting..." />
          </form>
        )}
      </SectionCard>

      <SectionCard title="Referral history" eyebrow="First-attribution only">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Product</th>
                <th>Status</th>
                <th>Attribution</th>
                <th>Value</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((referral) => (
                <tr key={referral.id}>
                  <td>{referral.referredCompany}</td>
                  <td>
                    {referral.product.name}
                    <br />
                    <span className="muted">{referral.package?.name ?? "No package"}</span>
                  </td>
                  <td>
                    <StatusBadge value={referral.status} />
                  </td>
                  <td>{referral.isAttributed ? "Attributed" : "Duplicate"}</td>
                  <td>{formatCurrency(referral.estimatedDealValue?.toString() ?? 0)}</td>
                  <td>{formatDateTime(referral.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
