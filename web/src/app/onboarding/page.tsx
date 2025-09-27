import Link from "next/link";

const onboardingSteps = [
  {
    title: "Profile",
    description: "Collect the participant name, time zone, and consent to generate the avatar.",
    checklist: ["Full name & preferred display name", "Personality slider (tone, formality)", "High-level biography"],
  },
  {
    title: "Media Uploads",
    description: "Gather a selfie video clip and a few voice lines to kick off cloning jobs.",
    checklist: ["Primary reference video (5-30 seconds)", "Optional gallery photos", "Voice sample (read script)", "Consent artifacts"],
  },
  {
    title: "Model Kickoff",
    description: "Confirm capture quality, trigger background processing, and show job status.",
    checklist: ["Run lip-sync model warmup", "Start voice cloning", "Queue GPT memory bootstrap", "Persist metadata"],
  },
];

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-12 px-6 pb-24 pt-20 sm:pt-28">
      <header className="flex flex-col gap-4 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Setup Flow</p>
        <h1 className="text-3xl font-semibold text-stone-50 sm:text-4xl">Capture your likeness in three guided steps</h1>
        <p className="text-base text-stone-300 sm:text-lg">
          The onboarding flow stores structured metadata in Supabase and streams media to storage buckets for model
          training. Use this page as the staging ground for future forms and uploaders.
        </p>
      </header>

      <div className="grid gap-6">
        {onboardingSteps.map((step, index) => (
          <section
            key={step.title}
            className="rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 sm:p-8"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="text-sm font-semibold text-stone-400">Step {index + 1}</span>
                <h2 className="mt-1 text-2xl font-semibold text-stone-100">{step.title}</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-300">{step.description}</p>
              </div>
              <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-300">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Checklist</p>
                <ul className="mt-3 space-y-2">
                  {step.checklist.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden className="mt-1 h-2 w-2 rounded-full bg-stone-300" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      <footer className="flex flex-col gap-3 rounded-3xl border border-stone-800 bg-stone-950/80 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-stone-100">Next up: Studio</h3>
          <p className="text-sm text-stone-300">Once processing completes, continue to the real-time studio to test the avatar.</p>
        </div>
        <Link
          href="/studio"
          className="rounded-full bg-stone-100 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-stone-950 transition hover:bg-stone-200"
        >
          Continue to Studio
        </Link>
      </footer>
    </div>
  );
}
