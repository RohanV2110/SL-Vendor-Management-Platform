import { ApplicationDetailsDialog } from "@/components/admin/application-details-dialog";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { reviewApplicationAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function AdminApplicationsPage() {
  const [applications, tiers, products] = await Promise.all([
    prisma.partnerApplication.findMany({
      orderBy: { submittedAt: "desc" },
      include: {
        product: true,
        assignedTier: true,
        answers: true,
        notes: {
          include: { author: true },
          orderBy: { createdAt: "desc" }
        },
        partnerAccount: {
          include: {
            documents: true
          }
        }
      }
    }),
    prisma.tier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
  ]);

  return (
    <SectionCard title="Applications" eyebrow="Partner review queue">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Submitted at</th>
              <th>Status</th>
              <th>Approve</th>
              <th>Reject</th>
              <th aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => {
              const dialogApplication = {
                id: application.id,
                fullName: application.fullName,
                email: application.email,
                phone: application.phone,
                company: application.company,
                country: application.country,
                promotionChannels: application.promotionChannels,
                aiTechExperience: application.aiTechExperience,
                audienceDescription: application.audienceDescription,
                status: application.status,
                submittedAt: application.submittedAt.toISOString(),
                adminNotes: application.adminNotes,
                product: application.product ? { name: application.product.name } : null,
                assignedTier: application.assignedTier ? { name: application.assignedTier.name } : null,
                answers: application.answers.map((answer) => ({
                  id: answer.id,
                  promptSnapshot: answer.promptSnapshot,
                  response: answer.response
                })),
                notes: application.notes.map((note) => ({
                  id: note.id,
                  body: note.body,
                  author: { name: note.author.name }
                })),
                partnerAccount: application.partnerAccount
                  ? {
                      id: application.partnerAccount.id,
                      company: application.partnerAccount.company,
                      primaryContactEmail: application.partnerAccount.primaryContactEmail,
                      documents: application.partnerAccount.documents.map((document) => ({
                        id: document.id,
                        type: document.type,
                        status: document.status
                      }))
                    }
                  : null
              };

              return (
                <tr key={application.id}>
                  <td>
                    <strong>{application.fullName || "Unnamed"}</strong>
                    {application.company ? (
                      <>
                        <br />
                        <span className="muted">{application.company}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{application.email}</td>
                  <td>{formatDateTime(application.submittedAt)}</td>
                  <td>
                    <StatusBadge value={application.status} />
                  </td>
                  <td>
                    <form action={reviewApplicationAction} className="inline-form">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <input type="hidden" name="assignedTierId" value={application.assignedTierId ?? tiers[0]?.id ?? ""} />
                      <input type="hidden" name="productId" value={application.productId ?? products[0]?.id ?? ""} />
                      <SubmitButton className="button table-action-button" label="Approve" pendingLabel="Approving..." />
                    </form>
                  </td>
                  <td>
                    <form action={reviewApplicationAction} className="inline-form">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <SubmitButton className="button button-secondary table-action-button" label="Reject" pendingLabel="Rejecting..." />
                    </form>
                  </td>
                  <td>
                    <ApplicationDetailsDialog application={dialogApplication} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
