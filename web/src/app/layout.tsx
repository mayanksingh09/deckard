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
      <body className="bg-slate-950 text-slate-100 antialiased">
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <Image
              src="/website background.png"
              alt="Neon city skyline background"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_65%)]" />
            <div className="absolute inset-0 mix-blend-screen bg-[linear-gradient(120deg,_rgba(56,189,248,0.25)_0%,_rgba(14,116,144,0.08)_40%,_transparent_75%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,_rgba(2,6,23,0.65)_0%,_rgba(2,6,23,0.45)_100%)]" />
          </div>
          <Providers>
            <div className="relative z-10 flex min-h-screen flex-col">
              <SiteHeader />
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </div>
          </Providers>
        </div>
      </body>
    </html>
  );
}
