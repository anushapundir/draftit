import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "draftit",
  description: "Paste your URL. Get 10 researched prospects and first emails in your voice, ready to approve.",
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
