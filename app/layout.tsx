import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BoonTrack Shop | Platform Otomasi Penjualan & WhatsApp Commerce Cerdas",
  description: "Solusi SaaS terintegrasi untuk kelola katalog digital, checkout otomatis, notifikasi WhatsApp instan, dan penerimaan pembayaran QRIS resmi PT BOONTRACK INOVASI DIGITAL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          src="/ads-tracker.js"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}