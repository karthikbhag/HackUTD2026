const workstreams = [
  {
    title: "Prepare",
    description: "Forecast impact areas, identify exposed households, and plan outreach.",
  },
  {
    title: "Respond",
    description: "Prioritize requests, coordinate teams, and track assistance.",
  },
  {
    title: "Follow through",
    description: "Review unresolved needs and households awaiting contact.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <header className="border-b border-slate-200 pb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-700">
          HackUTD 2026 · Project skeleton
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">RiskReach</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          Prepare before disasters. Coordinate assistance afterward.
          Keep track of people who still need help.
        </p>
      </header>
      <section aria-labelledby="workflow-heading" className="py-10">
        <h2 id="workflow-heading" className="text-xl font-semibold">
          Planned employee workflow
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {workstreams.map((workstream) => (
            <article key={workstream.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="font-semibold">{workstream.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {workstream.description}
              </p>
            </article>
          ))}
        </div>
      </section>
      <p className="rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600">
        Next.js and TypeScript are ready. The disaster map, live data,
        and SpacetimeDB connection are pending implementation.
      </p>
    </main>
  );
}
