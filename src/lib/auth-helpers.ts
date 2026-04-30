import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export async function requireRole(role: "ADMIN" | "PARTNER") {
  const user = await requireUser();
  if (user.role !== role) {
    redirect(user.role === "ADMIN" ? "/admin" : "/partner/dashboard");
  }

  return user;
}

export async function requirePartnerAccountId() {
  const user = await requireRole("PARTNER");

  if (!user.partnerAccountId) {
    redirect("/apply");
  }

  const partnerAccount = await prisma.partnerAccount.findUnique({
    where: { id: user.partnerAccountId },
    select: { id: true }
  });

  if (!partnerAccount) {
    redirect("/apply");
  }

  return partnerAccount.id;
}
