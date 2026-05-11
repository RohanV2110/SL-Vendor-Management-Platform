import { AppShell } from "@/components/app-shell";
import { PartnerActivationToast } from "@/components/partner-activation-toast";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const nav = [
  { href: "/partner/dashboard", label: "Dashboard" },
  { href: "/partner/referrals", label: "Referrals" },
  { href: "/partner/affiliates", label: "Deals" },
  { href: "/partner/earnings", label: "Earnings" },
  { href: "/partner/activity", label: "Activity" }
];

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partnerAccountId = await requirePartnerAccountId();
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId },
    select: {
      primaryContactName: true,
      status: true,
      activatedAt: true,
      activationNoticeSeenAt: true
    }
  });
  const firstName = partner?.primaryContactName?.trim().split(/\s+/)[0] || "there";

  const isActive = partner?.status === "ACTIVE";
  const showActivatedToast =
    isActive &&
    partner?.activatedAt != null &&
    (partner.activationNoticeSeenAt == null ||
      partner.activatedAt > partner.activationNoticeSeenAt);

  return (
    <AppShell title={`Welcome back, ${firstName}`} nav={nav}>
      {!isActive ? (
        <div className="status-banner status-banner--warning" role="status">
          <strong>Account needs to be activated.</strong>
          <span>Please contact the admin to unlock referrals and deals.</span>
        </div>
      ) : null}
      {showActivatedToast ? <PartnerActivationToast /> : null}
      {children}
    </AppShell>
  );
}
