export function SiteFooter() {
  return (
    <footer className="border-t border-slate-900/60 bg-slate-950/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-6 text-xs uppercase tracking-[0.3em] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Deckard Avatar Studio</span>
        <span>Built with Next.js, Supabase, and realtime media APIs</span>
      </div>
    </footer>
  );
}
