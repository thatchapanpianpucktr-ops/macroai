import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { WhatsNew } from "@/components/WhatsNew";
import { ApiKeyPrompt } from "@/components/ApiKeyPrompt";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MacroAI — photo calorie tracker",
  description:
    "Snap a photo, let AI estimate calories & macros, and get adaptive targets that learn from your weight trend.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MacroAI",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <main className="mx-auto max-w-md px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)]">
          {children}
        </main>
        <BottomNav />
        <ServiceWorker />
        <WhatsNew />
        <ApiKeyPrompt />
        <Analytics />
      </body>
    </html>
  );
}
