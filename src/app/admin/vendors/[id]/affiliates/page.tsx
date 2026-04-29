import Link from "next/link";
import { DealStage, PartnerAccountStatus } from "@prisma/client";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type AdminVendorAffiliatesPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    performance?: string;
    page?: string;
  }>;
};

export default async function AdminVendorAffiliatesPage({ params, searchParams }: AdminVendorAffiliatesPageProps) {
  const { id } = await params;
  const filters = searchParams ? await searchParams : {};
  const q = typeof filters.q === "string" ? filters.q.trim() : "";
  const status = typeof filters.status === "string" ? filters.status : "";
  const from = typeof filters.from === "string" ? filters.from : "";
  const to = typeof filters.to === "string" ? filters.to : "";
  const performance = typeof filters.performance === "string" ? filters.performance : "";
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const pageSize = 10;

  const vendor = await prisma.partnerAccount.findUniqueOrThrow({
    where: { id },
    select: {
      company: true,
      primaryContactName: true,
      primaryContactEmail: true,
      vendorReferralCode: true
    }
  });

  const affiliates = await prisma.partnerAccount.findMany({
    where: {
      referredByVendorId: id,
      ...(status ? { status: status as PartnerAccountStatus } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { affiliateId: { contains: q, mode: "insensitive" } },
              { primaryContactName: { contains: q, mode: "insensitive" } },
              { primaryContactEmail: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: {
      referrals: {
        select: { id: true }
      },
      deals: {
        select: {
          stage: true,
          closedValue: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const filteredAffiliates = affiliates.filter((affiliate) => {
    if (performance === "with_conversions") {
      return affiliate.deals.some((deal) => deal.stage === DealStage.CLOSED_WON);
    }

    if (performance === "with_revenue") {
      return affiliate.deals.some((deal) => Number(deal.closedValue ?? 0) > 0);
    }

    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filteredAffiliates.length / pageSize));
  const paginatedAffiliates = filteredAffiliates.slice((page - 1) * pageSize, page * pageSize);
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (performance) query.set("performance", performance);
    query.set("page", String(nextPage));
    return `/admin/vendors/${id}/affiliates?${query.toString()}`;
  };

  return (
    <div className="stack-lg">
      <SectionCard title={vendor.company || vendor.primaryContactName} eyebrow="Vendor affiliate view">
        <div className="three-col">
          <p className="note">
            <strong>Email</strong>
            <br />
            {vendor.primaryContactEmail}
          </p>
          <p className="note">
            <strong>Referral code</strong>
            <br />
            {vendor.vendorReferralCode ?? "Not generated"}
          </p>
          <p className="note">
            <strong>Visible affiliates</strong>
            <br />
            {filteredAffiliates.length}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Affiliates" eyebrow="Filtered by vendor">
        <div className="stack-lg">
          <form className="inline-form">
            <input className="input" name="q" placeholder="Search affiliate ID, name, or email" defaultValue={q} />
            <select className="select" name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {Object.values(PartnerAccountStatus).map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <input className="input" name="from" type="date" defaultValue={from} />
            <input className="input" name="to" type="date" defaultValue={to} />
            <select className="select" name="performance" defaultValue={performance}>
              <option value="">All performance</option>
              <option value="with_conversions">With conversions</option>
              <option value="with_revenue">With revenue</option>
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Date Joined</th>
                  <th>Status</th>
                  <th>Performance</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAffiliates.map((affiliate) => {
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
                {!paginatedAffiliates.length ? (
                  <tr>
                    <td colSpan={6}>No affiliates match these filters.</td>
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
    </div>
  );
}
