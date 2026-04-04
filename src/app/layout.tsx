import type { Metadata, Viewport } from "next";
import { Geist, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { SessionProvider } from "@/lib/session";

const geist = Geist({ subsets: ["latin"] });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: "IPL Fantasy 2026 — Lads vs Gils",
  description: "Private IPL Fantasy League tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IPL Fantasy",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#003087",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} ${barlowCondensed.variable} min-h-screen`} style={{ background: 'var(--ipl-light)', color: '#1a1a2e' }}>
        <SessionProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-6 pb-20 sm:pb-6">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
