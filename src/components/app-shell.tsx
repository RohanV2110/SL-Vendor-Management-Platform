import Link from "next/link";
import { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";

type NavItem = {
  href: string;
  label: string;
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  children: ReactNode;
};

export function AppShell({ title, subtitle, nav, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          Sugar & Leather AI
        </Link>
        <p className="sidebar-copy">Internal partner management for Aries AI and future programs.</p>
        <nav className="nav-list">
          {nav.map((item) => (
            <Link key={item.href} className="nav-link" href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <SignOutButton />
        </div>
      </aside>
      <main className="content">
        <header className="page-header">
          <p className="eyebrow">Sugar & Leather AI</p>
          <h1>{title}</h1>
          {subtitle ? <p className="lead">{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
