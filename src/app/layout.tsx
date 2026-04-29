import type { Metadata } from "next";
import { Cormorant_Garamond, Courier_Prime } from "next/font/google";
import "@/app/globals.css";
import { AuthSessionProvider } from "@/components/session-provider";

const heading = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-heading"
});

const mono = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Sugar & Leather AI Partner Platform",
  description: "Internal partner management system for Aries AI."
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${mono.variable}`}>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
