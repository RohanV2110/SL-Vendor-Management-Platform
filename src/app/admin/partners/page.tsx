import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { PartnerDetailsDialog, type PartnerDialogData } from "@/components/admin/partner-details-dialog";
import { prisma } from "@/lib/prisma";
import { buildAriesReferralLink } from "@/lib/referral-links";

export default async function AdminPartnersPage() {
  const partners = await prisma.partnerAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tier: true,
      profile: true,
      application: true,
      referrals: {
        include: { product: true },
        orderBy: { submittedAt: "desc" },
        take: 5
      },
      commissions: true,
      payoutBatches: true
    }
  });

  return (
    <SectionCard title="Partners" eyebrow="Directory and onboarding status">
      {partners.length === 0 ? (
        <div className="empty-state">No partners yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>ID</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => {
                const dialogData: PartnerDialogData = {
                  id: partner.id,
                  company: partner.company,
                  primaryContactName: partner.primaryContactName,
                  primaryContactEmail: partner.primaryContactEmail,
                  phone: partner.phone,
                  country: partner.country,
                  status: partner.status,
                  activatedAt: partner.activatedAt ? partner.activatedAt.toISOString() : null,
                  createdAt: partner.createdAt.toISOString(),
                  stripeOnboardingComplete: partner.stripeOnboardingComplete,
                  stripeAccountId: partner.stripeAccountId,
                  tierName: partner.tier?.name ?? null,
                  vendorReferralCode: partner.vendorReferralCode,
                  vendorReferralCodeActive: partner.vendorReferralCodeActive,
                  referralLink:
                    partner.vendorReferralCode && partner.vendorReferralCodeActive
                      ? buildAriesReferralLink(partner.vendorReferralCode)
                      : null,
                  referralsCount: partner.referrals.length,
                  earningsTotal: partner.commissions.reduce(
                    (sum, entry) => sum + Number(entry.amount),
                    0
                  ),
                  payoutBatchesCount: partner.payoutBatches.length,
                  promotionChannels:
                    partner.profile?.promotionChannels ?? partner.application.promotionChannels ?? null,
                  aiTechExperience:
                    partner.profile?.aiTechExperience ?? partner.application.aiTechExperience ?? null,
                  audienceDescription:
                    partner.profile?.audienceDescription ??
                    partner.application.audienceDescription ??
                    null,
                  recentReferrals: partner.referrals.map((referral) => ({
                    id: referral.id,
                    referredCompany: referral.referredCompany,
                    status: referral.status,
                    productName: referral.product.name,
                    submittedAt: referral.submittedAt.toISOString()
                  })),
                  detailHref: `/admin/partners/${partner.id}`
                };

                return (
                  <tr key={partner.id}>
                    <td>
                      <strong>{partner.company || partner.primaryContactName}</strong>
                      <br />
                      <span className="muted">{partner.primaryContactName}</span>
                    </td>
                    <td>{partner.primaryContactEmail}</td>
                    <td>
                      <code>{partner.id}</code>
                    </td>
                    <td>
                      <StatusBadge value={partner.status} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <PartnerDetailsDialog partner={dialogData} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
