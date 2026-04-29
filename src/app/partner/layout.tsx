import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth-helpers";

const nav = [
  { href: "/partner/dashboard", label: "Dashboard" },
  { href: "/partner/referrals", label: "Referrals" },
  { href: "/partner/earnings", label: "Earnings" },
  { href: "/partner/activity", label: "Activity" }
];

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("PARTNER");

  return (
    <AppShell
      title="Partner Portal"
      subtitle="Track onboarding, submit referrals after activation, monitor deals, and follow earnings."
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
