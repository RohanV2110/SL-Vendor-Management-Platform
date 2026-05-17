import { PartnerDealStage, PartnerDealStatus } from "@prisma/client";
import {
  AdminPartnerDealReviewDialog,
  type AdminPartnerDealReviewRow
} from "@/components/admin/admin-partner-deal-review-dialog";
import { SectionCard } from "@/components/section-card";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const STATUS_LABELS: Record<PartnerDealStatus, string> = {
  PENDING_APPROVAL: "INACTIVE",
  APPROVED: "Active",
  REJECTED: "Rejected"
};

const DEFAULT_DEAL_STAGE: PartnerDealStage = "PROCESSING";

function dealStatusClass(status: PartnerDealStatus | null | undefined) {
  return `deal-status deal-status--${(status ?? "PENDING_APPROVAL").toLowerCase()}`;
}

function stageLabel(stage: PartnerDealStage | null | undefined) {
  const s = stage ?? DEFAULT_DEAL_STAGE;
  if (s === "WON") return "Won";
  if (s === "LOST") return "Lost";
  return "Processing";
}

function stagePillClass(stage: PartnerDealStage | null | undefined) {
  return `deal-stage-pill deal-stage-pill--${(stage ?? DEFAULT_DEAL_STAGE).toLowerCase()}`;
}

export default async function AdminDealsPage() {
  const deals = await prisma.partnerDeal.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      partnerAccount: {
        select: {
          id: true,
          company: true,
          primaryContactName: true,
          primaryContactEmail: true
        }
      }
    }
  });

  const pendingCount = deals.filter((deal) => deal.status === "PENDING_APPROVAL").length;

  return (
    <SectionCard
      title="Partner Deals"
      eyebrow={
        pendingCount
          ? `${pendingCount} deal${pendingCount === 1 ? "" : "s"} awaiting your approval`
          : "All caught up"
      }
    >
      <div className="table-wrap table-wrap--deals-admin">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Referred by</th>
              <th>Value</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Submitted</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const partnerLabel =
                deal.partnerAccount.company || deal.partnerAccount.primaryContactName;
              const reviewRow: AdminPartnerDealReviewRow = {
                id: deal.id,
                updatedAt: deal.updatedAt.toISOString(),
                status: deal.status,
                stage: deal.stage,
                name: deal.name,
                email: deal.email,
                companyName: deal.companyName,
                website: deal.website,
                phoneCountryCode: deal.phoneCountryCode,
                phoneNumber: deal.phoneNumber,
                country: deal.country,
                state: deal.state,
                notes: deal.notes,
                dealValue: deal.dealValue ? deal.dealValue.toString() : null,
                referredByLabel: partnerLabel,
                referredByEmail: deal.partnerAccount.primaryContactEmail
              };

              return (
                <tr key={deal.id}>
                  <td>
                    <strong>{deal.name}</strong>
                    <br />
                    <span className="muted">{deal.companyName}</span>
                  </td>
                  <td>{deal.email}</td>
                  <td>
                    {partnerLabel}
                    <br />
                    <span className="muted">{deal.partnerAccount.primaryContactEmail}</span>
                  </td>
                  <td>{deal.dealValue ? formatCurrency(Number(deal.dealValue)) : "—"}</td>
                  <td>
                    <span className={dealStatusClass(deal.status)}>
                      {STATUS_LABELS[deal.status] ?? deal.status ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span className={stagePillClass(deal.stage)}>{stageLabel(deal.stage)}</span>
                  </td>
                  <td>{formatDateTime(deal.createdAt)}</td>
                  <td>
                    <AdminPartnerDealReviewDialog deal={reviewRow} />
                  </td>
                </tr>
              );
            })}
            {!deals.length ? (
              <tr>
                <td colSpan={8}>No deals submitted yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
