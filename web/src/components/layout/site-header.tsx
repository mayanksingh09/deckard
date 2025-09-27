import Link from "next/link";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/studio", label: "Studio" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/60 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.4em] text-cyan-300">
          Deckard
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-transparent px-4 py-2 transition hover:border-cyan-400/50 hover:text-cyan-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/onboarding"
          className="rounded-full border border-cyan-400/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 transition hover:border-cyan-200"
        >
          Launch Studio
        </Link>
      </div>
    </header>
  );
}
