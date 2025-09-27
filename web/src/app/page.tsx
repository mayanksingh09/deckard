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

const systemTelemetry = [
  {
    label: "SYNTH CORE LATENCY",
    value: "112 ms",
    description: "Edge-computed response time while streaming lip-sync packets.",
  },
  {
    label: "FRAME FIDELITY",
    value: "4K",
    description: "Neon-graded render passes with real-time tone mapping and bloom.",
  },
  {
    label: "VOICE LINK",
    value: "98%",
    description: "Similarity index measured across cloned spectral fingerprints.",
  },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-24 px-6 pb-28 pt-28 sm:px-10">
        <section className="grid items-start gap-12 text-left lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <span className="inline-flex w-fit items-center gap-3 rounded-full border border-stone-700/70 bg-stone-900/70 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-stone-400">
                Protocol // Nexus-9
              </span>
              <h1 className="text-4xl font-semibold leading-tight text-stone-50 sm:text-5xl lg:text-6xl">
                Coord your avatar stack with calm precision.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-stone-300 sm:text-xl">
                Deckard Avatar Studio fuses GPT-driven cognition with disciplined media orchestration so your digital
                double moves from capture to deployment without breaking flow.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                className="inline-flex items-center justify-center rounded-full bg-stone-100 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.35em] text-stone-950 transition hover:bg-stone-200"
                href="/onboarding"
              >
                Initiate Clone
              </a>
              <a
                className="inline-flex items-center justify-center rounded-full border border-stone-700/70 bg-stone-950/60 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.35em] text-stone-300 transition hover:border-stone-500 hover:text-stone-100"
                href="/studio"
              >
                Enter Studio
              </a>
            </div>
            <div className="grid gap-4 rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 shadow-[0_18px_60px_rgba(8,8,8,0.45)] sm:grid-cols-3">
              {systemTelemetry.map((telemetry) => (
                <div key={telemetry.label} className="flex flex-col gap-2">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.45em] text-stone-500">
                    {telemetry.label}
                  </span>
                  <span className="text-2xl font-semibold text-stone-100">{telemetry.value}</span>
                  <p className="text-[0.75rem] leading-relaxed text-stone-400">{telemetry.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-stone-800/80 bg-stone-950/80 p-8 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-600/40 to-transparent" />
            <div className="relative z-10 flex flex-col gap-4">
              <p className="text-[0.65rem] uppercase tracking-[0.5em] text-stone-500">Realtime loop diagnostics</p>
              <p className="text-base leading-relaxed text-stone-300">
                Input flows from whisper transcription or chat, syncs through Supabase timelines, and re-emits as calibrated
                speech with matched visemes. Monitor, tune, and redeploy without leaving the workspace.
              </p>
            </div>
            <div className="relative z-10 grid gap-4 rounded-2xl border border-stone-800 bg-stone-900/60 p-5">
              {buildPipeline.map((stage) => (
                <div key={stage.step} className="flex items-start gap-4">
                  <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-700 bg-stone-950/70 text-sm font-semibold text-stone-200">
                    {stage.step}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-400">{stage.title}</h3>
                    <p className="text-[0.8rem] leading-relaxed text-stone-300/80">{stage.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-stone-800/80 bg-stone-950/80 p-10 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(250,250,249,0.04)_0%,_rgba(12,10,9,0.35)_80%)]" />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-stone-500">
                Signal: Pillars
              </span>
              <h2 className="text-3xl font-semibold text-stone-50">Foundations of the avatar stack</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {featureHighlights.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/60 p-6 transition hover:border-stone-600"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(245,245,244,0.08),_transparent_70%)] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative z-10 flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-stone-100">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-stone-300">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative grid gap-12 rounded-3xl border border-stone-800/80 bg-stone-950/80 p-10 shadow-[0_18px_60px_rgba(8,8,8,0.45)] md:grid-cols-[0.75fr_1fr]">
          <div className="relative z-10 flex flex-col gap-4">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-stone-500">Pipeline // Night Shift</span>
            <h2 className="text-3xl font-semibold text-stone-50">From capture to co-pilot in three calm beats</h2>
            <p className="text-base leading-relaxed text-stone-300/90">
              Every avatar sprint flows through a triad of automations—capture, train, and engage. Trigger the jobs, watch
              Supabase orchestrate the media graph, then patch your replicant directly into the realtime studio.
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-stone-700/50 via-stone-700/0 to-stone-700/50 md:block" />
            <div className="space-y-6 md:pl-16">
              {buildPipeline.map((stage) => (
                <div
                  key={stage.step}
                  className="relative flex flex-col gap-2 rounded-2xl border border-stone-800 bg-stone-900/60 p-6"
                >
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.5em] text-stone-500">
                    Phase {stage.step}
                  </span>
                  <h3 className="text-xl font-semibold text-stone-100">{stage.title}</h3>
                  <p className="text-sm leading-relaxed text-stone-300">{stage.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
