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
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Realtime Studio</p>
          <h1 className="text-3xl font-semibold text-stone-50 sm:text-4xl">Converse with your digital self</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-300 sm:text-base">
            This workspace will host the WebRTC call loop, lip-sync video surface, and GPT-driven chat memory. Use the
            placeholders below to align data fetching, Supabase subscriptions, and streaming pipelines.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="rounded-full border border-stone-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-stone-300 transition hover:border-stone-500"
        >
          Re-run Onboarding
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-6 rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <div className="aspect-video w-full rounded-xl border border-stone-800 bg-gradient-to-br from-stone-950 to-stone-900" />
            <p className="mt-4 text-sm text-stone-300">
              Replace this placeholder with the live avatar canvas (WebGL/canvas or video element) that lip-syncs to the
              cloned voice output.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Streaming Transcript</p>
            <div className="mt-4 space-y-4 text-sm">
              {sampleMessages.map((message, index) => (
                <div key={index} className="rounded-2xl border border-stone-800 bg-stone-950/80 p-4">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-stone-500">{message.role}</p>
                  <p className="mt-2 text-stone-200">{message.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Pipeline status</p>
            <div className="mt-4 space-y-4">
              {statusCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-100">{card.title}</h3>
                    <span className="rounded-full border border-stone-700 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-widest text-stone-300">
                      {card.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-stone-300">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-stone-800 bg-stone-950/80 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Session Controls</p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <button className="rounded-full bg-stone-100 px-4 py-2 text-left font-semibold uppercase tracking-wide text-stone-950 transition hover:bg-stone-200">
                Start Live Session
              </button>
              <button className="rounded-full border border-stone-700 px-4 py-2 text-left font-semibold uppercase tracking-wide text-stone-300 transition hover:border-stone-500">
                Push Memory Update
              </button>
              <button className="rounded-full border border-stone-700/80 px-4 py-2 text-left font-semibold uppercase tracking-wide text-stone-300 transition hover:border-stone-500">
                End Session
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
