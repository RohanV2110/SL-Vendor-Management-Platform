import { PartnerDealStatus } from "@prisma/client";
import { PartnerDealDialog } from "@/components/partner-deal-dialog";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { deletePartnerDealAction, reviewPartnerDealAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const STATUS_LABELS: Record<PartnerDealStatus, string> = {
  PENDING_APPROVAL: "Inactive",
  APPROVED: "Active",
  REJECTED: "Rejected"
};

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Referred by</th>
              <th>Value</th>
              <th>Status</th>
              <th>Submitted</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const partnerLabel =
                deal.partnerAccount.company || deal.partnerAccount.primaryContactName;
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
                    <span className={`deal-status deal-status--${deal.status.toLowerCase()}`}>
                      {STATUS_LABELS[deal.status]}
                    </span>
                  </td>
                  <td>{formatDateTime(deal.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <div
                      className="inline-form"
                      style={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}
                    >
                      {deal.status === "PENDING_APPROVAL" ? (
                        <>
                          <form action={reviewPartnerDealAction}>
                            <input type="hidden" name="dealId" value={deal.id} />
                            <input type="hidden" name="decision" value="APPROVED" />
                            <SubmitButton
                              className="button"
                              label="Approve"
                              pendingLabel="Approving..."
                            />
                          </form>
                          <form action={reviewPartnerDealAction}>
                            <input type="hidden" name="dealId" value={deal.id} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <SubmitButton
                              className="button button-secondary"
                              label="Reject"
                              pendingLabel="Rejecting..."
                            />
                          </form>
                        </>
                      ) : null}
                      <PartnerDealDialog
                        mode="edit"
                        actorRole="ADMIN"
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
                      <form action={deletePartnerDealAction}>
                        <input type="hidden" name="dealId" value={deal.id} />
                        <SubmitButton
                          className="button button-danger"
                          label="Delete"
                          pendingLabel="Deleting..."
                        />
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!deals.length ? (
              <tr>
                <td colSpan={7}>No deals submitted yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
