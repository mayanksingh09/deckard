import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import Image from "next/image";
import { Providers } from "./providers";
import "./globals.css";

const roundedSans = Nunito({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
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
    icon: [{ url: "/logo_da.png" }],
    shortcut: [{ url: "/logo_da.png" }],
    apple: [{ url: "/logo_da.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roundedSans.variable} ${geistMono.variable}`}>
      <body className="bg-stone-950 text-stone-200 antialiased font-sans">
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
              <div className="absolute inset-0 bg-gradient-to-br from-stone-950/90 via-stone-900/78 to-stone-950/94" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,211,209,0.22),_transparent_60%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(120,113,108,0.2),_transparent_58%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(250,250,249,0.08)_0%,_rgba(41,37,36,0.65)_55%,_rgba(12,10,9,0.8)_100%)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,_rgba(250,250,249,0.07)_0%,_rgba(23,23,23,0)_100%)]" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-stone-700/40 via-stone-800/0 to-stone-700/40 sm:block" />
            <div className="relative z-10 flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(214,211,209,0.08),_transparent_65%)]">
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
