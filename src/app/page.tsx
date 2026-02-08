import Link from "next/link";
import { Dashboard } from "@/components/dashboard";

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
      description: "City, budget, vibe, and strict provider-backed itinerary planning.",
      enabled: true,
      cta: "Start Flow 1",
    },
    {
      id: "flow-2",
      title: "Love Letter + Voice",
      description: "Generate romantic copy and strict voice assets in one guided path.",
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
      description: "Start strict Vapi web-call sessions with partner-aware scenarios.",
      enabled: flow4Enabled,
      cta: "Start Flow 4",
    },
    {
      id: "flow-5",
      title: "Gift Finder",
      description: "Strict triple-provider recommendations with saved history.",
      enabled: flow5Enabled,
      cta: "Start Flow 5",
    },
  ] as const;

  const enabledCount = modules.filter((module) => module.enabled).length;
  const visibleModules = flow1Only
    ? modules.filter((module) => module.id === "flow-1")
    : modules;

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Love Concierge Platform</p>
        <h1>Valentine AI Suite</h1>
        <p className="hero-copy">
          Multi-user web app for date planning, gift intelligence, voice content,
          memory card generation, and live AI hotline sessions.
        </p>
        <div className="hero-grid">
          <article className="hero-stat">
            <strong>{enabledCount} Active Flows</strong>
            <span>Feature-flag aware launch matrix</span>
          </article>
          <article className="hero-stat">
            <strong>Strict Provider Mode</strong>
            <span>No silent fallback on guided production paths</span>
          </article>
          <article className="hero-stat">
            <strong>Accounts + History</strong>
            <span>Partner profiles and saved outputs across all modules</span>
          </article>
        </div>
        <div className="button-row">
          <Link className="flow-link-button" href="/flow-1">
            Start Flow 1
          </Link>
          {flow2Enabled && (
            <Link className="flow-link-button" href="/flow-2">
              Start Flow 2
            </Link>
          )}
          {flow3Enabled && (
            <Link className="flow-link-button" href="/flow-3">
              Start Flow 3
            </Link>
          )}
          {flow4Enabled && (
            <Link className="flow-link-button" href="/flow-4">
              Start Flow 4
            </Link>
          )}
          {flow5Enabled && (
            <Link className="flow-link-button" href="/flow-5">
              Start Flow 5
            </Link>
          )}
        </div>
      </section>
      <section className="panel" aria-label="Flow Launch Matrix">
        <h2>Flow Launch Matrix</h2>
        <p>
          Module status reflects current environment flags and focused launch mode.
        </p>
        <div className="module-grid">
          {visibleModules.map((module) => (
            <article key={module.id} className="module-card" data-testid={`home-module-${module.id}`}>
              <span className={module.enabled ? "module-badge enabled" : "module-badge disabled"}>
                {module.enabled ? "Enabled" : "Disabled"}
              </span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              {module.enabled ? (
                <Link className="flow-link-button" href={`/${module.id}`}>
                  {module.cta}
                </Link>
              ) : (
                <button type="button" disabled>
                  {module.cta}
                </button>
              )}
            </article>
          ))}
        </div>
        {flow1Only && (
          <p className="flow-note">
            Focused mode is enabled (`NEXT_PUBLIC_FLOW1_ONLY=true`). Dashboard hides non-core module surfaces.
          </p>
        )}
      </section>
      <Dashboard />
    </main>
  );
}
