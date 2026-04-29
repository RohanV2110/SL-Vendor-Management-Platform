import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function HomePage() {
  const [applications, referrals, commissions] = await Promise.all([
    prisma.partnerApplication.count(),
    prisma.referral.count(),
    prisma.commissionLedgerEntry.aggregate({
      _sum: {
        amount: true
      }
    })
  ]);

  return (
    <main className="landing">
      <section className="hero stack-lg">
        <div className="hero-grid">
          <div className="stack-lg">
            <div>
              <p className="eyebrow">Internal Partner Management</p>
              <h1>Partner operations for Aries AI, built to expand with future products.</h1>
              <p className="lead">
                Sugar &amp; Leather AI now has a single workspace for partner onboarding, referral
                attribution, agreement gating, commission tracking, payout staging, and quarterly
                activity monitoring.
              </p>
            </div>
            <div className="button-row">
              <Link className="button" href="/apply">
                Apply as a partner
              </Link>
              <Link className="button button-secondary" href="/login">
                Staff or partner login
              </Link>
            </div>
          </div>
          <div className="panel">
            <div className="panel-body stats-grid">
              <div className="stat">
                <span className="muted">Applications</span>
                <strong>{applications}</strong>
              </div>
              <div className="stat">
                <span className="muted">Referrals</span>
                <strong>{referrals}</strong>
              </div>
              <div className="stat">
                <span className="muted">Ledger total</span>
                <strong>{formatCurrency(commissions._sum.amount?.toString() ?? 0)}</strong>
              </div>
              <div className="stat">
                <span className="muted">Programs</span>
                <strong>Aries AI</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
