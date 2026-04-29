import Link from "next/link";
import { createReferralAction, generateVendorReferralCodeAction } from "@/lib/actions";
import { DealStage, PartnerAccountStatus } from "@prisma/client";
import { CopyButton } from "@/components/copy-button";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth-helpers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getPortalReferenceData } from "@/lib/services/platform";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type PartnerReferralsPageProps = {
  searchParams?: Promise<{
    affiliateSearch?: string;
    affiliateStatus?: string;
    affiliatePage?: string;
  }>;
};

export default async function PartnerReferralsPage({ searchParams }: PartnerReferralsPageProps) {
  const params = searchParams ? await searchParams : {};
  const affiliateSearch = typeof params.affiliateSearch === "string" ? params.affiliateSearch.trim() : "";
  const affiliateStatus = typeof params.affiliateStatus === "string" ? params.affiliateStatus : "";
  const affiliatePage = Math.max(1, Number(params.affiliatePage ?? 1) || 1);
  const affiliatePageSize = 10;
  const user = await requireRole("PARTNER");
  const partnerId = user.partnerAccountId!;

  const affiliateWhere = {
    referredByVendorId: partnerId,
    ...(affiliateStatus ? { status: affiliateStatus as PartnerAccountStatus } : {}),
    ...(affiliateSearch
      ? {
          OR: [
            { affiliateId: { contains: affiliateSearch, mode: "insensitive" as const } },
            { primaryContactName: { contains: affiliateSearch, mode: "insensitive" as const } },
            { primaryContactEmail: { contains: affiliateSearch, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [partner, { products }, referrals, affiliates, affiliateCount] = await Promise.all([
    prisma.partnerAccount.findUniqueOrThrow({
      where: { id: partnerId },
      select: {
        id: true,
        status: true,
        vendorReferralCode: true,
        vendorReferralCodeActive: true
      }
    }),
    getPortalReferenceData(),
    prisma.referral.findMany({
      where: { partnerAccountId: partnerId },
      include: {
        product: true,
        package: true
      },
      orderBy: { submittedAt: "desc" }
    }),
    prisma.partnerAccount.findMany({
      where: affiliateWhere,
      include: {
        referrals: {
          select: {
            id: true
          }
        },
        deals: {
          select: {
            stage: true,
            closedValue: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (affiliatePage - 1) * affiliatePageSize,
      take: affiliatePageSize
    }),
    prisma.partnerAccount.count({ where: affiliateWhere })
  ]);

  const referralLink =
    partner.vendorReferralCode && partner.vendorReferralCodeActive
      ? `${env.appBaseUrl}/apply?ref=${partner.vendorReferralCode}`
      : null;
  const affiliatePageCount = Math.max(1, Math.ceil(affiliateCount / affiliatePageSize));
  const affiliatePageHref = (page: number) => {
    const query = new URLSearchParams();
    if (affiliateSearch) query.set("affiliateSearch", affiliateSearch);
    if (affiliateStatus) query.set("affiliateStatus", affiliateStatus);
    query.set("affiliatePage", String(page));
    return `/partner/referrals?${query.toString()}`;
  };

  return (
    <div className="stack-lg">
      <SectionCard title="Vendor referral program" eyebrow="Affiliate recruitment">
        <div className="stack-lg">
          <div className="two-col">
            <div className="note">
              <strong>Referral code</strong>
              <p className="muted">{partner.vendorReferralCode ?? "No code generated yet"}</p>
              {partner.vendorReferralCode ? <CopyButton value={partner.vendorReferralCode} label="Copy code" /> : null}
            </div>
            <div className="note">
              <strong>Referral link</strong>
              <p className="muted">{referralLink ?? "Generate a code to create your referral link."}</p>
              {referralLink ? <CopyButton value={referralLink} label="Copy link" /> : null}
            </div>
          </div>
          <form action={generateVendorReferralCodeAction}>
            <input type="hidden" name="partnerAccountId" value={partner.id} />
            <SubmitButton
              label="Generate Referral Link & Code"
              pendingLabel="Generating..."
            />
          </form>
          {partner.vendorReferralCode ? (
            <p className="form-message">Referral link and code are ready for affiliates to use.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Linked affiliates" eyebrow="Vendor-only visibility">
        <form className="inline-form">
          <input className="input" name="affiliateSearch" placeholder="Search affiliate ID, name, or email" defaultValue={affiliateSearch} />
          <select className="select" name="affiliateStatus" defaultValue={affiliateStatus}>
            <option value="">All statuses</option>
            {Object.values(PartnerAccountStatus).map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button className="button button-secondary" type="submit">
            Filter
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Affiliate ID</th>
                <th>Affiliate Name</th>
                <th>Email</th>
                <th>Date Joined</th>
                <th>Status</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((affiliate) => {
                const conversions = affiliate.deals.filter((deal) => deal.stage === DealStage.CLOSED_WON).length;
                const revenue = affiliate.deals.reduce((sum, deal) => sum + Number(deal.closedValue ?? 0), 0);

                return (
                  <tr key={affiliate.id}>
                    <td>{affiliate.affiliateId ?? "Pending"}</td>
                    <td>{affiliate.primaryContactName}</td>
                    <td>{affiliate.primaryContactEmail}</td>
                    <td>{formatDateTime(affiliate.createdAt)}</td>
                    <td>
                      <StatusBadge value={affiliate.status} />
                    </td>
                    <td>
                      {affiliate.referrals.length} referrals · {conversions} conversions · {formatCurrency(revenue)}
                    </td>
                  </tr>
                );
              })}
              {!affiliates.length ? (
                <tr>
                  <td colSpan={6}>No affiliates are linked to your vendor referral code yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="inline-form" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            Page {affiliatePage} of {affiliatePageCount}
          </span>
          <div className="inline-form">
            {affiliatePage > 1 ? (
              <Link className="button button-secondary table-action-button" href={affiliatePageHref(affiliatePage - 1)}>
                Previous
              </Link>
            ) : null}
            {affiliatePage < affiliatePageCount ? (
              <Link className="button button-secondary table-action-button" href={affiliatePageHref(affiliatePage + 1)}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </SectionCard>

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
