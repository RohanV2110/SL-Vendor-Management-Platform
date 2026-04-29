import { cn, titleCaseFromEnum } from "@/lib/utils";

type StatusBadgeProps = {
  value: string;
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const tone =
    value.includes("ACTIVE") || value.includes("APPROVED") || value.includes("PAID") || value.includes("WON")
      ? "success"
      : value.includes("REJECTED") || value.includes("FAILED") || value.includes("LOST") || value.includes("CLAW")
        ? "danger"
        : value.includes("PENDING") || value.includes("REVIEW") || value.includes("SCHEDULED")
          ? "warning"
          : "neutral";

  return <span className={cn("badge", `badge-${tone}`)}>{titleCaseFromEnum(value)}</span>;
}
