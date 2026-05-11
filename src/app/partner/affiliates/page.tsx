import Link from "next/link";
import { redirect } from "next/navigation";
import { PartnerDealStatus } from "@prisma/client";
import { PartnerDealDialog } from "@/components/partner-deal-dialog";
import { SectionCard } from "@/components/section-card";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type PartnerDealsPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

const STATUS_LABELS: Record<PartnerDealStatus, string> = {
  PENDING_APPROVAL: "Inactive",
  APPROVED: "Active",
  REJECTED: "Rejected"
};

const STATUS_TOOLTIPS: Record<PartnerDealStatus, string> = {
  PENDING_APPROVAL: "The admin needs to verify and approve this.",
  APPROVED: "Approved by the admin.",
  REJECTED: "Rejected by the admin."
};

export default async function PartnerDealsPage({ searchParams }: PartnerDealsPageProps) {
  const params = searchParams ? await searchParams : {};
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusFilter =
    typeof params.status === "string" &&
    Object.values(PartnerDealStatus).includes(params.status as PartnerDealStatus)
      ? (params.status as PartnerDealStatus)
      : "";
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 10;
  const partnerId = await requirePartnerAccountId();

  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerId },
    select: { id: true, status: true }
  });

  if (!partner) {
    redirect("/apply");
  }

  const isActive = partner.status === "ACTIVE";

  const dealWhere = {
    partnerAccountId: partnerId,
    ...(statusFilter ? { status: statusFilter } : {}),
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
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { companyName: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [deals, dealCount] = await Promise.all([
    prisma.partnerDeal.findMany({
      where: dealWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.partnerDeal.count({ where: dealWhere })
  ]);

  const pageCount = Math.max(1, Math.ceil(dealCount / pageSize));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (statusFilter) query.set("status", statusFilter);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    query.set("page", String(nextPage));
    return `/partner/affiliates?${query.toString()}`;
  };

  return (
    <SectionCard
      title="Deals"
      eyebrow="Deals you have submitted"
      action={<PartnerDealDialog mode="create" disabled={!isActive} />}
    >
      <div className="stack-lg">
        <form className="filters-bar">
          <label className="filter-field">
            <span>Search</span>
            <input
              className="input"
              name="q"
              placeholder="Name, email, or company"
              defaultValue={q}
            />
          </label>
          <label className="filter-field">
            <span>Status</span>
            <select className="select" name="status" defaultValue={statusFilter}>
              <option value="">All statuses</option>
              {Object.values(PartnerDealStatus).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
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
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Status</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id}>
                  <td>{deal.name}</td>
                  <td>{deal.email}</td>
                  <td>{deal.companyName}</td>
                  <td>
                    <span
                      className={`deal-status deal-status--${deal.status.toLowerCase()}`}
                      title={STATUS_TOOLTIPS[deal.status]}
                    >
                      {STATUS_LABELS[deal.status]}
                    </span>
                  </td>
                  <td>{formatDateTime(deal.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <PartnerDealDialog
                      mode="edit"
                      actorRole="PARTNER"
                      existing={{
                        id: deal.id,
                        name: deal.name,
                        email: deal.email,
                        companyName: deal.companyName,
                        website: deal.website,
                        phoneCountryCode: deal.phoneCountryCode,
                        phoneNumber: deal.phoneNumber,
                        country: deal.country,
                        state: deal.state,
                        notes: deal.notes,
                        dealValue: deal.dealValue ? deal.dealValue.toString() : null
                      }}
                    />
                  </td>
                </tr>
              ))}
              {!deals.length ? (
                <tr>
                  <td colSpan={6}>
                    {isActive
                      ? "No deals yet. Click \u201CAdd Deal\u201D to submit your first one."
                      : "Your account is not active yet. Once approved, you can submit deals."}
                  </td>
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
