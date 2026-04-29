import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AdminPartnersPage() {
  const partners = await prisma.partnerAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: true,
      snapshots: {
        orderBy: [{ year: "desc" }, { quarter: "desc" }],
        take: 1
      },
      referrals: true,
      commissions: true
    }
  });

  return (
    <SectionCard title="Partners" eyebrow="Directory and onboarding status">
      <div className="stack-lg">
        {partners.map((partner) => (
          <Link key={partner.id} href={`/admin/partners/${partner.id}`} className="panel" style={{ boxShadow: "none" }}>
            <div className="panel-body">
              <div className="inline-form" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{partner.company || partner.primaryContactName}</strong>
                  <p className="muted">
                    {partner.primaryContactName} · {partner.primaryContactEmail}
                  </p>
                </div>
                <StatusBadge value={partner.status} />
              </div>
              <div className="three-col" style={{ marginTop: 16 }}>
                <p className="note">
                  <strong>Country</strong>
                  <br />
                  {partner.country || "—"}
                </p>
                <p className="note">
                  <strong>Referrals</strong>
                  <br />
                  {partner.referrals.length}
                </p>
                <p className="note">
                  <strong>Activated</strong>
                  <br />
                  {formatDate(partner.activatedAt)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
