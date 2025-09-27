import Link from "next/link";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/studio", label: "Studio" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-cyan-500/20 bg-slate-950/40 shadow-[0_0_25px_rgba(34,211,238,0.15)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-xs uppercase tracking-[0.35em] sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 text-[0.7rem] font-semibold text-cyan-200 transition hover:text-cyan-100"
        >
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[0.5rem] font-semibold text-cyan-200 shadow-[0_0_20px_rgba(8,145,178,0.45)]">
            AI
          </span>
          Deckard
        </Link>
        <nav className="hidden items-center gap-6 text-[0.65rem] text-cyan-100/70 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative px-4 py-2 transition hover:text-cyan-100"
            >
              <span className="relative z-10">{item.label}</span>
              <span className="absolute inset-0 -z-10 rounded-full border border-cyan-400/20 bg-cyan-500/5 opacity-0 transition hover:opacity-100" />
            </Link>
          ))}
        </nav>
        <Link
          href="/onboarding"
          className="rounded-full border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-[0.55rem] font-semibold tracking-[0.4em] text-cyan-100 shadow-[0_0_30px_rgba(6,182,212,0.35)] transition hover:border-cyan-200 hover:bg-cyan-500/30"
        >
          Launch Studio
        </Link>
      </div>
    </header>
  );
}
