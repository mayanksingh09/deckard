import Link from "next/link";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/studio", label: "Studio" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 text-xs uppercase tracking-[0.3em] sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-3 text-[0.7rem] font-semibold text-stone-100 transition hover:text-stone-50"
        >
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-700 bg-stone-900 text-[0.55rem] font-semibold text-stone-200">
            AI
          </span>
          Deckard
        </Link>
        <nav className="hidden items-center gap-6 text-[0.65rem] text-stone-400 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative px-4 py-2 transition hover:text-stone-100"
            >
              <span className="relative z-10">{item.label}</span>
              <span className="absolute inset-0 -z-10 rounded-full border border-stone-700/70 bg-stone-900/60 opacity-0 transition hover:opacity-100" />
            </Link>
          ))}
        </nav>
        <Link
          href="/onboarding"
          className="rounded-full border border-stone-700 bg-stone-100 px-4 py-2 text-[0.55rem] font-semibold tracking-[0.4em] text-stone-900 transition hover:bg-stone-200"
        >
          Launch Studio
        </Link>
      </div>
    </header>
  );
}
