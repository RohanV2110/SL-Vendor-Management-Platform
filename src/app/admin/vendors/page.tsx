import Link from "next/link";
import { DealStage } from "@prisma/client";
import { SectionCard } from "@/components/section-card";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

type AdminVendorsPageProps = {
  searchParams?: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function AdminVendorsPage({ searchParams }: AdminVendorsPageProps) {
  const params = searchParams ? await searchParams : {};
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 10;

  const where = q
    ? {
        OR: [
          { company: { contains: q, mode: "insensitive" as const } },
          { primaryContactName: { contains: q, mode: "insensitive" as const } },
          { primaryContactEmail: { contains: q, mode: "insensitive" as const } },
          { vendorReferralCode: { contains: q, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [vendors, vendorCount] = await Promise.all([
    prisma.partnerAccount.findMany({
      where,
      include: {
        affiliates: {
          include: {
            deals: {
              select: {
                stage: true,
                closedValue: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.partnerAccount.count({ where })
  ]);

  const pageCount = Math.max(1, Math.ceil(vendorCount / pageSize));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    query.set("page", String(nextPage));
    return `/admin/vendors?${query.toString()}`;
  };

  return (
    <SectionCard title="Vendors" eyebrow="Referral-code owners">
      <div className="stack-lg">
        <form className="inline-form">
          <input className="input" name="q" placeholder="Search vendors by name, email, or code" defaultValue={q} />
          <button className="button button-secondary" type="submit">
            Search
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>Email</th>
                <th>Referral Code</th>
                <th>Total Affiliates</th>
                <th>Total Performance</th>
                <th>Affiliates</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const conversions = vendor.affiliates.reduce(
                  (sum, affiliate) => sum + affiliate.deals.filter((deal) => deal.stage === DealStage.CLOSED_WON).length,
                  0
                );
                const revenue = vendor.affiliates.reduce(
                  (sum, affiliate) =>
                    sum + affiliate.deals.reduce((affiliateSum, deal) => affiliateSum + Number(deal.closedValue ?? 0), 0),
                  0
                );

                return (
                  <tr key={vendor.id}>
                    <td>
                      <strong>{vendor.company || vendor.primaryContactName}</strong>
                      <br />
                      <span className="muted">{vendor.primaryContactName}</span>
                    </td>
                    <td>{vendor.primaryContactEmail}</td>
                    <td>{vendor.vendorReferralCode ?? "Not generated"}</td>
                    <td>{vendor.affiliates.length}</td>
                    <td>
                      {conversions} conversions · {formatCurrency(revenue)}
                    </td>
                    <td>
                      <Link className="button button-secondary table-action-button" href={`/admin/vendors/${vendor.id}/affiliates`}>
                        View Affiliates
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!vendors.length ? (
                <tr>
                  <td colSpan={6}>No vendors found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="inline-form" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            Page {page} of {pageCount}
          </span>
          <div className="inline-form">
            {page > 1 ? (
              <Link className="button button-secondary table-action-button" href={pageHref(page - 1)}>
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link className="button button-secondary table-action-button" href={pageHref(page + 1)}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
