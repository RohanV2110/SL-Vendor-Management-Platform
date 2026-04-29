import { clsx } from "clsx";
import { format } from "date-fns";

export function cn(...parts: Array<string | false | null | undefined>) {
  return clsx(parts);
}

export function formatCurrency(value: number | string | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return format(new Date(value), "MMM d, yyyy");
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return format(new Date(value), "MMM d, yyyy h:mm a");
}

export function titleCaseFromEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getQuarter(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

export function startOfQuarter(year: number, quarter: number) {
  return new Date(Date.UTC(year, (quarter - 1) * 3, 1, 0, 0, 0));
}

export function endOfQuarter(year: number, quarter: number) {
  return new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59));
}

export function normalizeLeadKey(input: {
  company?: string | null;
  email?: string | null;
  domain?: string | null;
}) {
  const cleanedDomain = input.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const cleanedEmail = input.email?.trim().toLowerCase();

  if (cleanedDomain) {
    return `domain:${cleanedDomain}`;
  }

  if (cleanedEmail) {
    const emailDomain = cleanedEmail.split("@")[1];
    if (emailDomain) {
      return `domain:${emailDomain}`;
    }

    return `email:${cleanedEmail}`;
  }

  return `company:${(input.company ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}
