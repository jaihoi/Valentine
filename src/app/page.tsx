import Link from "next/link";

export default function Home() {
  const flow1Only = process.env.NEXT_PUBLIC_FLOW1_ONLY === "true";
  const flow2Enabled = process.env.NEXT_PUBLIC_FLOW2_ENABLED === "true";
  const flow3Enabled = process.env.NEXT_PUBLIC_FLOW3_ENABLED === "true";
  const flow4Enabled = process.env.NEXT_PUBLIC_FLOW4_ENABLED === "true";
  const flow5Enabled = process.env.NEXT_PUBLIC_FLOW5_ENABLED === "true";

  const modules = [
    {
      id: "flow-1",
      title: "Date Planner",
      description: "City, budget, and vibe-based itinerary planning in one guided flow.",
      enabled: true,
      cta: "Start Flow 1",
    },
    {
      id: "flow-2",
      title: "Love Letter + Voice",
      description: "Generate romantic messages and matching voice notes in one guided path.",
      enabled: flow2Enabled,
      cta: "Start Flow 2",
    },
    {
      id: "flow-3",
      title: "Memory Card Studio",
      description: "Direct/manual media add and card generation with status tracking.",
      enabled: flow3Enabled,
      cta: "Start Flow 3",
    },
    {
      id: "flow-4",
      title: "AI Hotline",
      description: "Start AI-powered web-call sessions with partner-aware scenarios.",
      enabled: flow4Enabled,
      cta: "Start Flow 4",
    },
    {
      id: "flow-5",
      title: "Gift Finder",
      description: "Personalized gift recommendations with rationale and saved history.",
      enabled: flow5Enabled,
      cta: "Start Flow 5",
    },
  ] as const;

  const visibleModules = flow1Only
    ? modules.filter((module) => module.id === "flow-1")
    : modules.filter((module) => module.enabled);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Love Concierge</p>
        <h1>Valentine</h1>
        <p className="hero-copy">
          Pick a guided flow and complete one task at a time with clear steps and
          saved history.
        </p>
      </section>
      <section className="panel" aria-label="Flow Launches">
        <h2>Choose Your Flow</h2>
        <p>Start one guided module below.</p>
        <div className="module-grid">
          {visibleModules.map((module) => (
            <article key={module.id} className="module-card" data-testid={`home-module-${module.id}`}>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <Link className="flow-link-button" href={`/${module.id}`}>
                {module.cta}
              </Link>
            </article>
          ))}
        </div>
        {flow1Only && (
          <p className="flow-note">
            Focused mode is enabled for Flow 1 only.
          </p>
        )}
      </section>
    </main>
  );
}
