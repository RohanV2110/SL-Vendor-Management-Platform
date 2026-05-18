/**
 * Diagnose missing Agreement rows for active partners (e.g. company "123ABC").
 * Run: npx tsx scripts/diagnose-partner-agreement.ts [companyFilter]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const filter = process.argv[2] ?? "123";

async function main() {
  const partners = await prisma.partnerAccount.findMany({
    where: {
      OR: [
        { company: { contains: filter, mode: "insensitive" } },
        { primaryContactName: { contains: filter, mode: "insensitive" } }
      ]
    },
    include: {
      tier: { select: { id: true, name: true } },
      agreements: { orderBy: [{ version: "desc" }] },
      application: { select: { id: true, status: true, assignedTierId: true } }
    }
  });

  if (partners.length === 0) {
    console.log(`No partners matching "${filter}".`);
    return;
  }

  for (const partner of partners) {
    console.log("---");
    console.log(`Company:     ${partner.company}`);
    console.log(`Partner ID:  ${partner.id}`);
    console.log(`Status:      ${partner.status}`);
    console.log(`Tier:        ${partner.tier?.name ?? "(none)"} (${partner.tierId})`);
    console.log(`Activated:   ${partner.activatedAt?.toISOString() ?? "—"}`);
    console.log(`Agreements:  ${partner.agreements.length}`);
    for (const a of partner.agreements) {
      console.log(
        `  - v${a.version} ${a.status} tier=${a.tierId} created=${a.createdAt.toISOString()}`
      );
    }
    if (partner.status === "ACTIVE" && partner.tierId && partner.agreements.length === 0) {
      console.log(
        "ISSUE: Partner is ACTIVE with a tier but has zero Agreement rows — manual commissions will fail until fixed."
      );
    }
    console.log(`Application: ${partner.application.status} assignedTier=${partner.application.assignedTierId}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
