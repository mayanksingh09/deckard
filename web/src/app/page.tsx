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
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-24 px-6 pb-32 pt-32 sm:px-10">
        <section className="grid items-start gap-12 text-left lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <span className="inline-flex w-fit items-center gap-3 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-cyan-200/80">
                Protocol // Nexus-9
              </span>
              <h1 className="text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl lg:text-6xl">
                Spin up neon-lit replicants with cinematic fidelity.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-cyan-100/80 sm:text-xl">
                Deckard Avatar Studio fuses GPT-driven cognition with holographic rendering passes, orchestrating capture,
                training, and deployment so your digital double hits the grid in a single night cycle.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                className="group relative overflow-hidden rounded-full border border-cyan-400/70 bg-cyan-500/20 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.45em] text-cyan-100 shadow-[0_0_35px_rgba(8,145,178,0.45)] transition hover:border-cyan-200 hover:bg-cyan-500/40"
                href="/onboarding"
              >
                <span className="relative z-10">Initiate Clone</span>
                <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle,_rgba(34,211,238,0.45),_transparent_60%)] opacity-0 transition group-hover:opacity-100" />
              </a>
              <a
                className="group relative overflow-hidden rounded-full border border-cyan-400/20 px-8 py-3 text-center text-sm font-semibold uppercase tracking-[0.45em] text-cyan-100/70 transition hover:border-cyan-300/50 hover:text-cyan-100"
                href="/studio"
              >
                <span className="relative z-10">Enter Studio</span>
                <span className="absolute inset-0 -z-10 bg-cyan-500/10 opacity-0 transition group-hover:opacity-100" />
              </a>
            </div>
            <div className="grid gap-4 border border-cyan-500/10 bg-slate-950/60 p-6 shadow-[0_0_45px_rgba(8,145,178,0.25)] sm:grid-cols-3">
              {systemTelemetry.map((telemetry) => (
                <div key={telemetry.label} className="flex flex-col gap-2">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.45em] text-cyan-200/60">
                    {telemetry.label}
                  </span>
                  <span className="text-2xl font-semibold text-cyan-100">{telemetry.value}</span>
                  <p className="text-[0.75rem] leading-relaxed text-cyan-100/60">{telemetry.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950/70 p-8 shadow-[0_0_60px_rgba(34,211,238,0.25)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_75%)]" />
            <div className="relative z-10 flex flex-col gap-4">
              <p className="text-[0.65rem] uppercase tracking-[0.55em] text-cyan-200/70">Realtime loop diagnostics</p>
              <p className="text-base leading-relaxed text-cyan-100/80">
                Input flows from whisper transcription or chat, syncs through Supabase timelines, and re-emits as volumetric
                speech with perfect viseme alignment. Monitor, tune, and redeploy from a single neon dashboard.
              </p>
            </div>
            <div className="relative z-10 grid gap-4 rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-5">
              {buildPipeline.map((stage) => (
                <div key={stage.step} className="flex items-start gap-4">
                  <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-sm font-semibold text-cyan-200">
                    {stage.step}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100/80">{stage.title}</h3>
                    <p className="text-[0.8rem] leading-relaxed text-cyan-100/60">{stage.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950/70 p-10 shadow-[0_0_60px_rgba(8,145,178,0.2)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.3),_transparent_70%)]" />
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-cyan-200/70">
                Signal: Pillars
              </span>
              <h2 className="text-3xl font-semibold text-slate-50">Neon pillars of the avatar stack</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {featureHighlights.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-6 transition hover:border-cyan-300/50"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.3),_transparent_75%)] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative z-10 flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-cyan-100">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-cyan-100/70">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative grid gap-12 rounded-3xl border border-cyan-500/20 bg-slate-950/70 p-10 shadow-[0_0_60px_rgba(14,165,233,0.2)] md:grid-cols-[0.75fr_1fr]">
          <div className="relative z-10 flex flex-col gap-4">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-cyan-200/70">Pipeline // Night Shift</span>
            <h2 className="text-3xl font-semibold text-slate-50">From capture to co-pilot in three glowing beats</h2>
            <p className="text-base leading-relaxed text-cyan-100/70">
              Every avatar sprint flows through a triad of automations—capture, train, and engage. Trigger the jobs, watch
              Supabase orchestrate the media graph, then patch your replicant directly into the realtime studio.
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-cyan-400/50 via-cyan-500/20 to-transparent md:block" />
            <div className="space-y-6 md:pl-16">
              {buildPipeline.map((stage) => (
                <div
                  key={stage.step}
                  className="relative flex flex-col gap-2 rounded-2xl border border-cyan-500/20 bg-slate-900/60 p-6 shadow-[0_0_35px_rgba(8,145,178,0.2)]"
                >
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.5em] text-cyan-200/70">
                    Phase {stage.step}
                  </span>
                  <h3 className="text-xl font-semibold text-cyan-100">{stage.title}</h3>
                  <p className="text-sm leading-relaxed text-cyan-100/70">{stage.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
