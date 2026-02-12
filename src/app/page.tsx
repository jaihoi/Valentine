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
      outcome: "Get a complete itinerary with budget-aware suggestions.",
      enabled: true,
      cta: "Start Flow 1",
    },
    {
      id: "flow-2",
      title: "Love Letter + Voice",
      description: "Generate romantic messages and matching voice notes in one guided path.",
      outcome: "Leave with polished text and voice content ready to share.",
      enabled: flow2Enabled,
      cta: "Start Flow 2",
    },
    {
      id: "flow-3",
      title: "Memory Card Studio",
      description: "Direct/manual media add and card generation with status tracking.",
      outcome: "Build a personalized memory card from your own media.",
      enabled: flow3Enabled,
      cta: "Start Flow 3",
    },
    {
      id: "flow-4",
      title: "AI Hotline",
      description: "Start AI-powered web-call sessions with partner-aware scenarios.",
      outcome: "Launch a guided call with live session status tracking.",
      enabled: flow4Enabled,
      cta: "Start Flow 4",
    },
    {
      id: "flow-5",
      title: "Gift Finder",
      description: "Personalized gift recommendations with rationale and saved history.",
      outcome: "Get ranked gift ideas with reasons and source links.",
      enabled: flow5Enabled,
      cta: "Start Flow 5",
    },
  ] as const;

  const visibleModules = flow1Only
    ? modules.filter((module) => module.id === "flow-1")
    : modules.filter((module) => module.enabled);

  return (
    <main className="app-shell home-shell">
      <section className="home-hero">
        <div className="home-hero-main">
          <p className="eyebrow">Love Concierge</p>
          <h1>Valentine</h1>
          <p className="hero-copy">
            Plan meaningful moments faster with guided flows, clearer steps, and
            saved progress.
          </p>
          <div className="button-row home-cta-row" data-testid="home-primary-cta-row">
            <Link className="flow-link-button home-cta-primary" href="/register">
              Create Account
            </Link>
            <Link className="flow-link-button secondary home-cta-secondary" href="/login">
              Sign In
            </Link>
          </div>
        </div>
        <aside className="home-stage-card" aria-label="Getting started">
          <p className="home-stage-label">Stage A</p>
          <h2>Set up in under a minute</h2>
          <p>
            Create your account first, then pick the flow that matches what you want
            to do right now.
          </p>
          <ul className="home-stage-list">
            <li>
              <strong>1.</strong> Create Account
            </li>
            <li>
              <strong>2.</strong> Choose Your Flow
            </li>
            <li>
              <strong>3.</strong> Get results and history
            </li>
          </ul>
        </aside>
      </section>

      <section className="home-how" aria-label="How it works">
        <p className="eyebrow">How It Works</p>
        <div className="home-how-grid">
          <article className="home-how-item">
            <h3>Create your profile</h3>
            <p>Start with account setup once, then reuse it across all flows.</p>
          </article>
          <article className="home-how-item">
            <h3>Pick one guided flow</h3>
            <p>
              Each flow focuses on a single task, so you can move quickly without
              guesswork.
            </p>
          </article>
          <article className="home-how-item">
            <h3>Review and iterate</h3>
            <p>Save outputs and come back later to refine or generate new versions.</p>
          </article>
        </div>
      </section>

      <section className="home-flow-panel" aria-label="Flow Launches">
        <p className="eyebrow">Stage B</p>
        <h2>Choose Your Flow</h2>
        <p>Start one guided module below.</p>
        <div className="module-grid">
          {visibleModules.map((module) => (
            <article
              key={module.id}
              className="module-card home-module-card"
              data-testid={`home-module-${module.id}`}
            >
              <p className="module-badge enabled">Guided</p>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <p className="home-module-outcome">{module.outcome}</p>
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
