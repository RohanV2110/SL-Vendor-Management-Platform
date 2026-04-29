import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth-helpers";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/deals", label: "Deals" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/questionnaire", label: "Questionnaire" },
  { href: "/admin/audit-log", label: "Audit Log" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");

  return (
    <AppShell
      title="Admin Dashboard"
      subtitle="Application review, referral approval, commission controls, and partner operations."
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
