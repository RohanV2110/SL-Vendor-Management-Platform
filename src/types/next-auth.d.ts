import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "ADMIN" | "PARTNER";
      partnerAccountId?: string | null;
    };
  }

  interface User {
    role: "ADMIN" | "PARTNER";
    partnerAccountId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "PARTNER";
    partnerAccountId?: string | null;
  }
}
