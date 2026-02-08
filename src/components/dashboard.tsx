"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

type ApiState = {
  loading: boolean;
  error: string | null;
  data: unknown;
};

type User = {
  id: string;
  email: string;
  name: string | null;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}

async function callApi(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export function Dashboard() {
  const flow1Only = process.env.NEXT_PUBLIC_FLOW1_ONLY === "true";
  const flow2Enabled = process.env.NEXT_PUBLIC_FLOW2_ENABLED === "true";
  const flow3Enabled = process.env.NEXT_PUBLIC_FLOW3_ENABLED === "true";
  const flow4Enabled = process.env.NEXT_PUBLIC_FLOW4_ENABLED === "true";
  const flow5Enabled = process.env.NEXT_PUBLIC_FLOW5_ENABLED === "true";
  const apiLabEnabled = process.env.NEXT_PUBLIC_API_LAB_ENABLED === "true";

  const [user, setUser] = useState<User | null>(null);
  const [apiState, setApiState] = useState<ApiState>({
    loading: false,
    error: null,
    data: null,
  });

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [partnerForm, setPartnerForm] = useState({
    name: "",
    interests: "music,dance,movies",
    dislikes: "crowds",
    notes: "",
  });
  const [dateForm, setDateForm] = useState({
    city: "New York",
    budget: 150,
    vibe: "romantic rooftop",
    dietary: "",
    date_time: "",
    partner_profile_id: "",
  });
  const [giftForm, setGiftForm] = useState({
    interests: "music,coffee,travel",
    budget: 120,
    constraints: "",
    partner_profile_id: "",
  });
  const [letterForm, setLetterForm] = useState({
    tone: "warm and playful",
    length: "medium",
    memories: "our first coffee date;our weekend road trip;our late night talks",
    partner_name: "",
  });
  const [voiceForm, setVoiceForm] = useState({
    text: "Happy Valentine's Day. I love you deeply and endlessly.",
    voice_id: "",
    style: "romantic",
  });
  const [assetForm, setAssetForm] = useState({
    cloudinary_id: "",
    secure_url: "",
    resource_type: "image",
  });
  const [cardForm, setCardForm] = useState({
    asset_ids: "",
    template_id: "classic-rose",
    message_text: "Forever my favorite person.",
    music_option: "piano-soft",
  });
  const [vapiForm, setVapiForm] = useState({
    scenario: "Plan a romantic evening and script a sweet message",
    partner_profile_id: "",
  });

  useEffect(() => {
    void (async () => {
      try {
        const result = await callApi("/api/auth/me", { method: "GET" });
        setUser(result.user as User);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  async function run(
    action: () => Promise<unknown>,
    options?: { refreshUser?: boolean },
  ) {
    setApiState({ loading: true, error: null, data: null });
    try {
      const data = await action();
      setApiState({ loading: false, error: null, data });
      if (options?.refreshUser) {
        try {
          const me = await callApi("/api/auth/me", { method: "GET" });
          setUser(me.user as User);
        } catch {
          setUser(null);
        }
      }
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : "Unexpected error",
        data: null,
      });
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        callApi("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(authForm),
        }),
      { refreshUser: true },
    );
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    await run(
      () =>
        callApi("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
          }),
        }),
      { refreshUser: true },
    );
  }

  async function handleLogout() {
    await run(
      () =>
        callApi("/api/auth/logout", {
          method: "POST",
        }),
      { refreshUser: true },
    );
  }

  async function handlePartnerCreate(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/partner-profile", {
        method: "POST",
        body: JSON.stringify({
          name: partnerForm.name,
          interests: partnerForm.interests
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          dislikes: partnerForm.dislikes
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          notes: partnerForm.notes || undefined,
        }),
      }),
    );
  }

  async function handleDatePlan(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/plan/date", {
        method: "POST",
        body: JSON.stringify({
          ...dateForm,
          budget: Number(dateForm.budget),
          partner_profile_id: dateForm.partner_profile_id || undefined,
          date_time: dateForm.date_time || undefined,
        }),
      }),
    );
  }

  async function handleGifts(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/gifts/recommend", {
        method: "POST",
        body: JSON.stringify({
          interests: giftForm.interests
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          budget: Number(giftForm.budget),
          constraints: giftForm.constraints || undefined,
          partner_profile_id: giftForm.partner_profile_id || undefined,
        }),
      }),
    );
  }

  async function handleLetter(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/content/love-letter", {
        method: "POST",
        body: JSON.stringify({
          tone: letterForm.tone,
          length: letterForm.length,
          partner_name: letterForm.partner_name,
          memories: letterForm.memories
            .split(";")
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      }),
    );
  }

  async function handleVoice(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/content/voice", {
        method: "POST",
        headers: {
          "Idempotency-Key": `voice-${Date.now()}`,
        },
        body: JSON.stringify({
          text: voiceForm.text,
          voice_id: voiceForm.voice_id || undefined,
          style: voiceForm.style || undefined,
        }),
      }),
    );
  }

  async function handleAssetCreate(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/media/assets", {
        method: "POST",
        body: JSON.stringify({
          cloudinary_id: assetForm.cloudinary_id,
          secure_url: assetForm.secure_url,
          resource_type: assetForm.resource_type,
        }),
      }),
    );
  }

  async function handleCardGenerate(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      callApi("/api/cards/generate", {
        method: "POST",
        headers: {
          "Idempotency-Key": `card-${Date.now()}`,
        },
        body: JSON.stringify({
          asset_ids: cardForm.asset_ids
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          template_id: cardForm.template_id,
          message_text: cardForm.message_text,
          music_option: cardForm.music_option || undefined,
        }),
      }),
    );
  }

  async function handleVapiStart(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    await run(() =>
      callApi("/api/vapi/session/start", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          scenario: vapiForm.scenario,
          partner_profile_id: vapiForm.partner_profile_id || undefined,
        }),
      }),
    );
  }

  const enabledFlowCount =
    1 +
    Number(flow2Enabled) +
    Number(flow3Enabled) +
    Number(flow4Enabled) +
    Number(flow5Enabled);

  return (
    <div className="dashboard">
      <div className="status-banner">
        <p>
          Session:{" "}
          {user ? `${user.name ?? "User"} (${user.email})` : "Not authenticated"}
        </p>
        <button onClick={handleLogout} disabled={!user || apiState.loading}>
          Log out
        </button>
      </div>

      <section className="panel" data-testid="dashboard-command-center">
        <h2>Command Center</h2>
        <p>Launch guided modules and monitor the latest API activity from one place.</p>
        <div className="dashboard-grid">
          <article className="cmd-card">
            <h3>Session Snapshot</h3>
            <div className="cmd-kpis">
              <div className="cmd-kpi">
                <strong>{user ? "Active" : "Guest"}</strong>
                <span>Auth state</span>
              </div>
              <div className="cmd-kpi">
                <strong>{enabledFlowCount}</strong>
                <span>Enabled flows</span>
              </div>
              <div className="cmd-kpi">
                <strong>{apiState.error ? "Error" : "Healthy"}</strong>
                <span>Latest result</span>
              </div>
            </div>
          </article>

          <article className="cmd-card" data-testid="dashboard-flow-launches">
            <h3>Flow Launches</h3>
            <p>Open guided workflows directly from the command center.</p>
            <div className="button-row">
              <Link className="flow-link-button" href="/flow-1">
                Open Flow 1 Wizard
              </Link>
              {flow2Enabled && (
                <Link className="flow-link-button" href="/flow-2">
                  Open Flow 2 Wizard
                </Link>
              )}
              {flow3Enabled && (
                <Link className="flow-link-button" href="/flow-3">
                  Open Flow 3 Wizard
                </Link>
              )}
              {flow4Enabled && (
                <Link className="flow-link-button" href="/flow-4">
                  Open Flow 4 Wizard
                </Link>
              )}
              {flow5Enabled && (
                <Link className="flow-link-button" href="/flow-5">
                  Open Flow 5 Wizard
                </Link>
              )}
            </div>
          </article>

          <article className="cmd-card">
            <h3>Latest API Status</h3>
            {apiState.loading && <p className="status-text">Loading...</p>}
            {apiState.error && <p className="status-text error">{apiState.error}</p>}
            {!apiState.loading && !apiState.error && (
              <p className="flow-note">Last API call completed successfully.</p>
            )}
            <pre>{JSON.stringify(apiState.data, null, 2)}</pre>
          </article>
        </div>
      </section>

      {flow1Only && (
        <Section
          title="Flow 1 Mode"
          description="Non-Flow-1 modules are hidden. Use guided onboarding and date planning."
        >
          <p className="flow-note">
            Use the command center launch matrix above to open enabled guided flows.
          </p>
        </Section>
      )}

      {apiLabEnabled && (
        <section className="panel" data-testid="dashboard-api-lab">
          <h2>Advanced API Lab</h2>
          <p>
            All direct endpoint tools remain available for debugging and operator use.
          </p>

          <details className="details-lab" data-testid="dashboard-api-auth">
            <summary>Auth APIs</summary>
            <div className="details-lab-body">
              <form className="grid-form" onSubmit={handleRegister}>
                <input
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm((s) => ({ ...s, name: e.target.value }))
                  }
                />
                <input
                  placeholder="Email"
                  type="email"
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm((s) => ({ ...s, email: e.target.value }))
                  }
                />
                <input
                  placeholder="Password (min 8)"
                  type="password"
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm((s) => ({ ...s, password: e.target.value }))
                  }
                />
                <div className="button-row">
                  <button type="submit" disabled={apiState.loading}>
                    Register
                  </button>
                  <button type="button" onClick={handleLogin} disabled={apiState.loading}>
                    Log in
                  </button>
                </div>
              </form>
            </div>
          </details>

        <details className="details-lab" data-testid="dashboard-api-flow1">
          <summary>Flow 1 Core APIs</summary>
          <div className="details-lab-body">
            <form className="grid-form" onSubmit={handlePartnerCreate}>
              <input
                placeholder="Partner name"
                value={partnerForm.name}
                onChange={(e) =>
                  setPartnerForm((s) => ({ ...s, name: e.target.value }))
                }
              />
              <input
                placeholder="Interests comma-separated"
                value={partnerForm.interests}
                onChange={(e) =>
                  setPartnerForm((s) => ({ ...s, interests: e.target.value }))
                }
              />
              <input
                placeholder="Dislikes comma-separated"
                value={partnerForm.dislikes}
                onChange={(e) =>
                  setPartnerForm((s) => ({ ...s, dislikes: e.target.value }))
                }
              />
              <textarea
                placeholder="Notes"
                rows={2}
                value={partnerForm.notes}
                onChange={(e) =>
                  setPartnerForm((s) => ({ ...s, notes: e.target.value }))
                }
              />
              <button
                type="submit"
                disabled={apiState.loading}
                data-testid="dashboard-save-partner-profile"
              >
                Save Partner Profile
              </button>
            </form>

            <form className="grid-form compact" onSubmit={handleDatePlan}>
              <input
                placeholder="City"
                value={dateForm.city}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, city: e.target.value }))
                }
              />
              <input
                placeholder="Budget"
                type="number"
                value={dateForm.budget}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, budget: Number(e.target.value) }))
                }
              />
              <input
                placeholder="Vibe"
                value={dateForm.vibe}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, vibe: e.target.value }))
                }
              />
              <input
                placeholder="Dietary"
                value={dateForm.dietary}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, dietary: e.target.value }))
                }
              />
              <input
                placeholder="Date time (ISO)"
                value={dateForm.date_time}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, date_time: e.target.value }))
                }
              />
              <input
                placeholder="Partner profile id (optional)"
                value={dateForm.partner_profile_id}
                onChange={(e) =>
                  setDateForm((s) => ({ ...s, partner_profile_id: e.target.value }))
                }
              />
              <button type="submit" disabled={apiState.loading}>
                Generate Date Plan
              </button>
            </form>
          </div>
        </details>

        {!flow1Only && (
          <>
            <details className="details-lab" data-testid="dashboard-api-flow2">
              <summary>Flow 2 Letter + Voice APIs</summary>
              <div className="details-lab-body">
                <form className="grid-form" onSubmit={handleLetter}>
                  <input
                    placeholder="Partner name"
                    value={letterForm.partner_name}
                    onChange={(e) =>
                      setLetterForm((s) => ({ ...s, partner_name: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Tone"
                    value={letterForm.tone}
                    onChange={(e) =>
                      setLetterForm((s) => ({ ...s, tone: e.target.value }))
                    }
                  />
                  <select
                    value={letterForm.length}
                    onChange={(e) =>
                      setLetterForm((s) => ({ ...s, length: e.target.value }))
                    }
                  >
                    <option value="short">short</option>
                    <option value="medium">medium</option>
                    <option value="long">long</option>
                  </select>
                  <textarea
                    rows={2}
                    placeholder="Memories separated by ;"
                    value={letterForm.memories}
                    onChange={(e) =>
                      setLetterForm((s) => ({ ...s, memories: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={apiState.loading}>
                    Generate Love Letter
                  </button>
                </form>

                <form className="grid-form compact" onSubmit={handleVoice}>
                  <textarea
                    rows={2}
                    placeholder="Voice text"
                    value={voiceForm.text}
                    onChange={(e) =>
                      setVoiceForm((s) => ({ ...s, text: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Voice id (optional)"
                    value={voiceForm.voice_id}
                    onChange={(e) =>
                      setVoiceForm((s) => ({ ...s, voice_id: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Style (optional)"
                    value={voiceForm.style}
                    onChange={(e) =>
                      setVoiceForm((s) => ({ ...s, style: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={apiState.loading}>
                    Generate Voice Audio
                  </button>
                </form>
              </div>
            </details>

            <details className="details-lab" data-testid="dashboard-api-flow3">
              <summary>Flow 3 Memory Card APIs</summary>
              <div className="details-lab-body">
                <form className="grid-form" onSubmit={handleAssetCreate}>
                  <input
                    placeholder="Cloudinary public id"
                    value={assetForm.cloudinary_id}
                    onChange={(e) =>
                      setAssetForm((s) => ({ ...s, cloudinary_id: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Cloudinary secure url"
                    value={assetForm.secure_url}
                    onChange={(e) =>
                      setAssetForm((s) => ({ ...s, secure_url: e.target.value }))
                    }
                  />
                  <select
                    value={assetForm.resource_type}
                    onChange={(e) =>
                      setAssetForm((s) => ({ ...s, resource_type: e.target.value }))
                    }
                  >
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="raw">raw</option>
                  </select>
                  <button type="submit" disabled={apiState.loading}>
                    Register Memory Asset
                  </button>
                </form>

                <form className="grid-form compact" onSubmit={handleCardGenerate}>
                  <input
                    placeholder="Asset ids comma-separated"
                    value={cardForm.asset_ids}
                    onChange={(e) =>
                      setCardForm((s) => ({ ...s, asset_ids: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Template id"
                    value={cardForm.template_id}
                    onChange={(e) =>
                      setCardForm((s) => ({ ...s, template_id: e.target.value }))
                    }
                  />
                  <textarea
                    rows={2}
                    placeholder="Message text"
                    value={cardForm.message_text}
                    onChange={(e) =>
                      setCardForm((s) => ({ ...s, message_text: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Music option"
                    value={cardForm.music_option}
                    onChange={(e) =>
                      setCardForm((s) => ({ ...s, music_option: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={apiState.loading}>
                    Generate Card
                  </button>
                </form>
              </div>
            </details>

            <details className="details-lab" data-testid="dashboard-api-flow4">
              <summary>Flow 4 Hotline API</summary>
              <div className="details-lab-body">
                <form className="grid-form" onSubmit={handleVapiStart}>
                  <textarea
                    rows={2}
                    placeholder="Scenario"
                    value={vapiForm.scenario}
                    onChange={(e) =>
                      setVapiForm((s) => ({ ...s, scenario: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Partner profile id (optional)"
                    value={vapiForm.partner_profile_id}
                    onChange={(e) =>
                      setVapiForm((s) => ({ ...s, partner_profile_id: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={apiState.loading || !user}>
                    Start Vapi Session
                  </button>
                </form>
              </div>
            </details>

            <details className="details-lab" data-testid="dashboard-api-flow5">
              <summary>Flow 5 Gift API</summary>
              <div className="details-lab-body">
                <form className="grid-form" onSubmit={handleGifts}>
                  <input
                    placeholder="Interests comma-separated"
                    value={giftForm.interests}
                    onChange={(e) =>
                      setGiftForm((s) => ({ ...s, interests: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Budget"
                    type="number"
                    value={giftForm.budget}
                    onChange={(e) =>
                      setGiftForm((s) => ({ ...s, budget: Number(e.target.value) }))
                    }
                  />
                  <input
                    placeholder="Constraints"
                    value={giftForm.constraints}
                    onChange={(e) =>
                      setGiftForm((s) => ({ ...s, constraints: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Partner profile id (optional)"
                    value={giftForm.partner_profile_id}
                    onChange={(e) =>
                      setGiftForm((s) => ({ ...s, partner_profile_id: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={apiState.loading}>
                    Recommend Gifts
                  </button>
                </form>
              </div>
            </details>
          </>
        )}
        </section>
      )}
    </div>
  );
}

