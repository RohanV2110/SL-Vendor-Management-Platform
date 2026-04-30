import { AppShell } from "@/components/app-shell";
import { requirePartnerAccountId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const nav = [
  { href: "/partner/dashboard", label: "Dashboard" },
  { href: "/partner/referrals", label: "Referrals" },
  { href: "/partner/affiliates", label: "Affiliates" },
  { href: "/partner/earnings", label: "Earnings" },
  { href: "/partner/activity", label: "Activity" }
];

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partnerAccountId = await requirePartnerAccountId();
  const partner = await prisma.partnerAccount.findUnique({
    where: { id: partnerAccountId },
    select: { primaryContactName: true }
  });
  const firstName = partner?.primaryContactName?.trim().split(/\s+/)[0] || "there";

  return (
    <AppShell
      title={`Welcome back, ${firstName}`}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
