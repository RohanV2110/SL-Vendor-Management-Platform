import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerAccountStatus } from "@prisma/client";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type AdminVendorAffiliatesPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function AdminVendorAffiliatesPage({ params, searchParams }: AdminVendorAffiliatesPageProps) {
  const { id } = await params;
  const filters = searchParams ? await searchParams : {};
  const q = typeof filters.q === "string" ? filters.q.trim() : "";
  const status =
    typeof filters.status === "string" && Object.values(PartnerAccountStatus).includes(filters.status as PartnerAccountStatus)
      ? filters.status
      : "";
  const from = typeof filters.from === "string" ? filters.from : "";
  const to = typeof filters.to === "string" ? filters.to : "";
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const pageSize = 10;

  const vendor = await prisma.partnerAccount.findUnique({
    where: { id },
    select: {
      company: true,
      primaryContactName: true,
      primaryContactEmail: true,
      vendorReferralCode: true
    }
  });

  if (!vendor) {
    redirect("/admin/vendors");
  }

  const affiliateWhere = {
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
            { affiliateId: { contains: q, mode: "insensitive" as const } },
            { primaryContactName: { contains: q, mode: "insensitive" as const } },
            { primaryContactEmail: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [affiliates, affiliateCount] = await Promise.all([
    prisma.partnerAccount.findMany({
      where: affiliateWhere,
      select: {
        id: true,
        affiliateId: true,
        primaryContactName: true,
        primaryContactEmail: true,
        createdAt: true,
        status: true
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.partnerAccount.count({ where: affiliateWhere })
  ]);

  const pageCount = Math.max(1, Math.ceil(affiliateCount / pageSize));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    query.set("page", String(nextPage));
    return `/admin/vendors/${id}/affiliates?${query.toString()}`;
  };

  return (
    <div className="stack-lg">
      <SectionCard
        title={vendor.company || vendor.primaryContactName}
        eyebrow="Vendor affiliate view"
        action={
          <Link className="button button-secondary" href="/admin/vendors">
            Back to Vendors
          </Link>
        }
      >
        <div className="three-col">
          <div className="metric-card">
            <span className="muted">Vendor Email</span>
            <strong>{vendor.primaryContactEmail}</strong>
          </div>
          <div className="metric-card">
            <span className="muted">Referral Code</span>
            <strong>{vendor.vendorReferralCode ?? "Not generated"}</strong>
          </div>
          <div className="metric-card">
            <span className="muted">Total Affiliates</span>
            <strong>{affiliateCount}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Affiliates" eyebrow="Filtered by vendor">
        <div className="stack-lg">
          <form className="filters-bar">
            <label className="filter-field">
              <span>Search</span>
              <input className="input" name="q" placeholder="Name, email, or affiliate ID" defaultValue={q} />
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select className="select" name="status" defaultValue={status}>
                <option value="">All statuses</option>
                {Object.values(PartnerAccountStatus).map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase().replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>From</span>
              <input className="input" name="from" type="date" defaultValue={from} />
            </label>
            <label className="filter-field">
              <span>To</span>
              <input className="input" name="to" type="date" defaultValue={to} />
            </label>
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
                </tr>
              </thead>
              <tbody>
                {affiliates.map((affiliate) => (
                  <tr key={affiliate.id}>
                    <td>{affiliate.affiliateId ?? "Pending"}</td>
                    <td>{affiliate.primaryContactName}</td>
                    <td>{affiliate.primaryContactEmail}</td>
                    <td>{formatDateTime(affiliate.createdAt)}</td>
                    <td>
                      <StatusBadge value={affiliate.status} />
                    </td>
                  </tr>
                ))}
                {!affiliates.length ? (
                  <tr>
                    <td colSpan={5}>No affiliates match these filters.</td>
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
