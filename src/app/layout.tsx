import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { SessionProvider } from "@/lib/session";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IPL Fantasy 2026 — Lads vs Gils",
  description: "Private IPL Fantasy League tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} min-h-screen`} style={{ background: 'var(--ipl-light)', color: '#1a1a2e' }}>
        <SessionProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
