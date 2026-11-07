import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Imtiaz General Store - Wholesale & Retail, Ismaila",
    template: "%s | Imtiaz General Store",
  },
  description:
    "Imtiaz General Store - Wholesale & Retail, Kiryana, General Items. Fast billing with thermal printer 58mm, stock, profit, Udhar Khata. Offline PWA - Ismaila.",
  applicationName: "Imtiaz General Store",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Imtiaz Store",
  },
  icons: {
    icon: [
      { url: "/icon-circle-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-circle-180.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-circle-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-circle-180.png", sizes: "180x180", type: "image/png" }
    ],
    shortcut: ["/icon-circle-192.png"],
  },
  openGraph: {
    title: "Imtiaz General Store - امتیاز جنرل سٹور",
    description: "Wholesale & Retail • Fast Billing • Thermal Print 58mm • Offline PWA - Ismaila",
    type: "website",
    images: ["/icon-circle-512.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f4fb8",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <SWRegister />
        {children}
      </body>
    </html>
  );
}