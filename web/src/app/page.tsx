const featureHighlights = [
  {
    title: "Avatar Studio",
    description:
      "Upload a short video to build a photoreal talking head with automated lip-sync and expression blending.",
  },
  {
    title: "Voice Twin",
    description:
      "Clone a user voice sample and stream low-latency speech back through the avatar in real time.",
  },
  {
    title: "Conversational Memory",
    description:
      "Persist preferences and biography details so every session feels more like the real person.",
  },
  {
    title: "Realtime Co-Pilot",
    description:
      "Route chat, voice input, and avatar playback through a unified orchestration layer built on Supabase + Next.js.",
  },
];

const buildPipeline = [
  {
    step: "1",
    title: "Capture",
    detail: "Collect a selfie video clip and a few voice lines through the onboarding flow.",
  },
  {
    step: "2",
    title: "Train",
    detail:
      "Kick off media processing jobs: face embedding, voice cloning, and memory bootstrap in Supabase storage.",
  },
  {
    step: "3",
    title: "Engage",
    detail:
      "Spin up a realtime chat with GPT, stream audio, and render a responsive talking head in the Studio.",
  },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden bg-slate-950">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_60%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-24 px-6 pb-32 pt-28 sm:px-10">
        <section className="grid gap-10 text-center sm:grid-cols-[1.1fr_0.9fr] sm:text-left">
          <div className="flex flex-col gap-6">
            <span className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400/80">
              Deckard Deep Research
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
              Build a real-time personal AI avatar in hours, not weeks.
            </h1>
            <p className="text-lg text-slate-300 sm:text-xl">
              Deckard Avatar Studio orchestrates media ingestion, Supabase persistence, and GPT-driven
              conversation so you can launch a believable digital clone fast.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <a
                className="rounded-full bg-cyan-400 px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-900 transition hover:bg-cyan-300"
                href="/onboarding"
              >
                Start Onboarding
              </a>
              <a
                className="rounded-full border border-slate-700 px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-cyan-200 transition hover:border-cyan-400/70 hover:text-cyan-200"
                href="/studio"
              >
                View Studio
              </a>
            </div>
          </div>
          <div className="flex h-full flex-col justify-center rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
              <p className="text-sm uppercase tracking-widest text-cyan-300/80">
                Realtime Loop
              </p>
              <p className="mt-4 text-left text-base leading-relaxed text-slate-200">
                Input flows from whisper transcription or chat, streams into GPT with a personal prompt, then renders
                cloned audio and a synchronized video track. Supabase keeps session memory, preferences, and media
                artifacts in sync across the stack.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-slate-800/60 bg-slate-900/40 p-8">
          <h2 className="text-2xl font-semibold text-slate-100">Product pillars</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {featureHighlights.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-lg shadow-cyan-500/5"
              >
                <h3 className="text-lg font-semibold text-cyan-200">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
          <h2 className="text-2xl font-semibold text-slate-100">Build pipeline</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {buildPipeline.map((stage) => (
              <div key={stage.step} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/20 text-sm font-semibold text-cyan-200">
                  {stage.step}
                </span>
                <h3 className="text-lg font-semibold text-slate-100">{stage.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{stage.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
