import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";

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
