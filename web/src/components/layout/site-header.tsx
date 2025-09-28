import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-4 text-2xl font-bold text-stone-100 transition hover:text-stone-50"
        >
          <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border border-stone-700 bg-stone-900 text-lg font-bold text-stone-200">
            AI
          </span>
          DECKARD
        </Link>
      </div>
    </header>
  );
}
