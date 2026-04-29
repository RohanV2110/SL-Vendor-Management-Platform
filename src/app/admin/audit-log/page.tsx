import { SectionCard } from "@/components/section-card";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAuditLogPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    include: { actorUser: true },
    take: 100
  });

  const examples = [
    "Partner application submitted",
    "Partner application approved or rejected",
    "Signed documents emailed and marked complete",
    "Referral approved, rejected, or marked duplicate",
    "Deal moved to closed won and commission created",
    "Payout batch created or marked paid",
    "Clawback entry created"
  ];

  return (
    <div className="stack-lg">
      <SectionCard title="Audit log examples" eyebrow="What gets tracked">
        <div className="pill-row">
          {examples.map((example) => (
            <span key={example} className="pill">
              {example}
            </span>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Audit log" eyebrow="Workflow and money-affecting actions">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.actorUser?.name ?? "System"}</td>
                  <td>
                    {log.entityType} / {log.entityId}
                  </td>
                  <td>{log.action}</td>
                  <td>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
