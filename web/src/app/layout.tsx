import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Providers } from "./providers";
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
  title: "Deckard Avatar Studio",
  description:
    "Prototype workspace for building real-time personal AI avatars with voice and video cloning.",
  icons: {
    icon: [{ url: "/favicon.ico" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-stone-950 text-stone-200 antialiased">
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <Image
                src="/website background.png"
                alt="Ambient city backdrop"
                fill
                priority
                className="object-cover"
              />
              <div className="absolute inset-0 bg-stone-950/70" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(136,84,24,0.12),_transparent_65%)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,_rgba(250,250,249,0.04)_0%,_rgba(23,23,23,0)_100%)]" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-stone-700/40 via-stone-800/0 to-stone-700/40 sm:block" />
            <div className="relative z-10 flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(136,84,24,0.08),_transparent_60%)]">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
