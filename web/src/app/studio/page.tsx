import Link from "next/link";

const statusCards = [
  {
    title: "Voice Engine",
    status: "Ready",
    description: "Streaming endpoint connected. Latency targets under 250ms round-trip.",
  },
  {
    title: "Avatar Renderer",
    status: "Queued",
    description: "Awaiting latest lip-sync render. Poll the processing jobs API for updates.",
  },
  {
    title: "Memory Graph",
    status: "Syncing",
    description: "New highlights from recent chats are merging into the Supabase vector store.",
  },
];

const sampleMessages = [
  {
    role: "user",
    content: "How should I introduce myself in the upcoming investor meeting?",
  },
  {
    role: "assistant",
    content:
      "Lead with gratitude, ground the conversation in shared wins, and invite questions on our avatar roadmap.",
  },
];

export default function StudioPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 pb-28 pt-14 sm:pt-20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-400/80">Realtime Studio</p>
          <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">Converse with your digital self</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
            This workspace will host the WebRTC call loop, lip-sync video surface, and GPT-driven chat memory. Use the
            placeholders below to align data fetching, Supabase subscriptions, and streaming pipelines.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 transition hover:border-cyan-400/70"
        >
          Re-run Onboarding
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="aspect-video w-full rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800" />
            <p className="mt-4 text-sm text-slate-400">
              Replace this placeholder with the live avatar canvas (WebGL/canvas or video element) that lip-syncs to the
              cloned voice output.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/80">Streaming Transcript</p>
            <div className="mt-4 space-y-4 text-sm">
              {sampleMessages.map((message, index) => (
                <div key={index} className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cyan-400/60">{message.role}</p>
                  <p className="mt-2 text-slate-200">{message.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/70">Pipeline status</p>
            <div className="mt-4 space-y-4">
              {statusCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
                    <span className="rounded-full border border-cyan-400/40 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-widest text-cyan-300">
                      {card.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/70">Session Controls</p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <button className="rounded-full bg-cyan-400 px-4 py-2 text-left font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-cyan-300">
                Start Live Session
              </button>
              <button className="rounded-full border border-slate-700 px-4 py-2 text-left font-semibold uppercase tracking-wide text-cyan-200 transition hover:border-cyan-300/60">
                Push Memory Update
              </button>
              <button className="rounded-full border border-rose-700/60 px-4 py-2 text-left font-semibold uppercase tracking-wide text-rose-300 transition hover:border-rose-500/70">
                End Session
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
