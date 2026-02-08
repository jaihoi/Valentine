"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FlowActionRow,
  FlowErrorAlert,
  FlowHeader,
  FlowSection,
  FlowShell,
  FlowStatus,
} from "@/components/flow";
import {
  type AuthFieldKey,
  type AuthSubmitMode,
  type PartnerFieldKey,
  firstErrorKey as firstFlow1Error,
  hasFieldErrors as hasFlow1Errors,
  parseCommaSeparatedValues,
  validateAuthForm,
  validatePartnerForm,
} from "@/lib/flow1/validation";
import {
  type ScenarioFieldKey,
  firstErrorKey as firstFlow4Error,
  hasFieldErrors as hasFlow4Errors,
  validateScenarioForm,
} from "@/lib/flow4/validation";

type Step = "auth" | "partner" | "scenario" | "result";

type SessionStatus = "CREATED" | "ACTIVE" | "COMPLETED" | "FAILED";

type User = {
  id: string;
  email: string;
  name: string | null;
};

type PartnerProfile = {
  id: string;
  name: string;
  interests: string[];
  notes?: string | null;
};

type Flow4SessionItem = {
  id: string;
  partnerProfileId?: string | null;
  scenario: string;
  callLinkOrNumber?: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  providerMeta?: Record<string, unknown>;
};

type Flow4HistoryResponse = {
  partner_profiles: PartnerProfile[];
  voice_sessions: Flow4SessionItem[];
};

type SessionStartResponse = {
  session_id: string;
  call_link_or_number: string;
  status: SessionStatus;
};

type SessionStatusResponse = {
  session_id: string;
  call_link_or_number: string | null;
  status: SessionStatus;
  updated_at: string;
  provider_meta?: Record<string, unknown>;
};

type ApiError = {
  error?: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
  details?: unknown;
};

type ErrorState = {
  message: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
};

const authFieldIds: Record<AuthFieldKey, string> = {
  name: "flow4-auth-name-input",
  email: "flow4-auth-email-input",
  password: "flow4-auth-password-input",
};

const partnerFieldIds: Record<PartnerFieldKey, string> = {
  name: "flow4-profile-name-input",
  interests: "flow4-profile-interests-input",
};

const scenarioFieldIds: Record<ScenarioFieldKey, string> = {
  scenario: "flow4-scenario-input",
};

function buildDescribedBy(helpId: string, errorId: string, hasError: boolean) {
  return hasError ? `${helpId} ${errorId}` : helpId;
}

function focusElementById(id: string) {
  const element = document.getElementById(id);
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

function createIdempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`;
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
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const maybeError = payload as ApiError | null;
    throw {
      message: maybeError?.error ?? `Request failed with status ${response.status}`,
      code: maybeError?.code,
      retryable: maybeError?.retryable ?? false,
      provider: maybeError?.provider,
      details: maybeError?.details,
    };
  }

  return payload;
}

export default function FlowFourPage() {
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [sessions, setSessions] = useState<Flow4SessionItem[]>([]);

  const [currentSessionId, setCurrentSessionId] = useState("");
  const [currentSession, setCurrentSession] = useState<SessionStatusResponse | null>(
    null,
  );

  const [error, setError] = useState<ErrorState | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);

  const [authErrors, setAuthErrors] = useState<Partial<Record<AuthFieldKey, string>>>(
    {},
  );
  const [partnerErrors, setPartnerErrors] = useState<
    Partial<Record<PartnerFieldKey, string>>
  >({});
  const [scenarioErrors, setScenarioErrors] = useState<
    Partial<Record<ScenarioFieldKey, string>>
  >({});

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [profileForm, setProfileForm] = useState({
    name: "",
    interests: "music,dinner,travel",
    dislikes: "",
    notes: "",
  });
  const [scenarioForm, setScenarioForm] = useState({
    scenario: "Help me run a warm, romantic check-in call tonight.",
  });

  const pollingTimerRef = useRef<number | null>(null);
  const errorPanelRef = useRef<HTMLElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const currentStepLabel = useMemo(() => {
    switch (step) {
      case "auth":
        return "Auth";
      case "partner":
        return "Partner";
      case "scenario":
        return "Scenario";
      case "result":
        return "Result";
      default:
        return "Flow 4";
    }
  }, [step]);

  useEffect(() => {
    if (!error) return;
    errorPanelRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (step === "auth") {
      focusElementById(authFieldIds.name);
      return;
    }
    if (step === "partner") {
      focusElementById(partnerFieldIds.name);
      return;
    }
    if (step === "scenario") {
      focusElementById(scenarioFieldIds.scenario);
      return;
    }
    if (step === "result") {
      resultHeadingRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        window.clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  function clearAuthFieldError(field: AuthFieldKey) {
    setAuthErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearPartnerFieldError(field: PartnerFieldKey) {
    setPartnerErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearScenarioFieldError(field: ScenarioFieldKey) {
    setScenarioErrors((current) => ({ ...current, [field]: undefined }));
  }

  function stopPolling() {
    if (pollingTimerRef.current) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  async function runAction(action: () => Promise<void>, pendingMessage: string) {
    setLoading(true);
    setLoadingMessage(pendingMessage);
    setError(null);
    setRetryAction(() => action);
    try {
      await action();
    } catch (rawError) {
      const e = rawError as {
        message?: string;
        code?: string;
        retryable?: boolean;
        provider?: string;
      };
      setError({
        message: e.message ?? "Unexpected error",
        code: e.code,
        retryable: e.retryable,
        provider: e.provider,
      });
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }

  async function refreshAuthState() {
    const me = (await callApi("/api/auth/me", { method: "GET" })) as { user: User };
    setUser(me.user);
  }

  async function refreshFlowState() {
    const flow = (await callApi("/api/history/flow-4", {
      method: "GET",
    })) as Flow4HistoryResponse;

    setProfiles(flow.partner_profiles);
    if (flow.partner_profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(flow.partner_profiles[0]!.id);
    }
    setSessions(flow.voice_sessions);
  }

  useEffect(() => {
    void runAction(
      async () => {
        try {
          await refreshAuthState();
          await refreshFlowState();
          setStep("partner");
        } catch {
          setUser(null);
          setStep("auth");
        }
      },
      "Loading Flow 4...",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAuthSubmit(mode: AuthSubmitMode) {
    const validated = validateAuthForm(authForm, mode);
    setAuthErrors(validated);
    if (hasFlow1Errors(validated)) {
      const first = firstFlow1Error(validated);
      if (first) focusElementById(authFieldIds[first]);
      return;
    }

    await runAction(
      async () => {
        if (mode === "register") {
          await callApi("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(authForm),
          });
        } else {
          await callApi("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
              email: authForm.email,
              password: authForm.password,
            }),
          });
        }

        await refreshAuthState();
        await refreshFlowState();
        setStep("partner");
      },
      mode === "register" ? "Creating account..." : "Signing in...",
    );
  }

  async function handleCreatePartner() {
    const validated = validatePartnerForm({
      name: profileForm.name,
      interests: profileForm.interests,
    });
    setPartnerErrors(validated);
    if (hasFlow1Errors(validated)) {
      const first = firstFlow1Error(validated);
      if (first) focusElementById(partnerFieldIds[first]);
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow4-partner-profile");
    await runAction(
      async () => {
        const created = (await callApi("/api/partner-profile", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            name: profileForm.name,
            interests: parseCommaSeparatedValues(profileForm.interests),
            dislikes: parseCommaSeparatedValues(profileForm.dislikes),
            notes: profileForm.notes || undefined,
          }),
        })) as { profile: PartnerProfile };

        setSelectedProfileId(created.profile.id);
        await refreshFlowState();
      },
      "Saving partner profile...",
    );
  }

  async function pollSessionStatus(sessionId: string, attempt = 0): Promise<void> {
    stopPolling();
    setStatusMessage("Checking session status...");
    try {
      const status = (await callApi(`/api/flow-4/session/${sessionId}`, {
        method: "GET",
      })) as SessionStatusResponse;
      setCurrentSession(status);

      if (status.status === "COMPLETED" || status.status === "FAILED") {
        await refreshFlowState();
        setStatusMessage(
          status.status === "COMPLETED"
            ? "Session completed."
            : "Session failed. Retry if needed.",
        );
        return;
      }

      if (attempt >= 20) {
        setError({
          message: "Session status polling timed out. Refresh status again.",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "vapi",
        });
        setRetryAction(() => () => pollSessionStatus(sessionId, 0));
        return;
      }

      pollingTimerRef.current = window.setTimeout(() => {
        void pollSessionStatus(sessionId, attempt + 1);
      }, 1500);
    } catch (rawError) {
      const e = rawError as {
        message?: string;
        code?: string;
        retryable?: boolean;
        provider?: string;
      };
      setError({
        message: e.message ?? "Unable to fetch session status",
        code: e.code,
        retryable: e.retryable ?? true,
        provider: e.provider,
      });
      setRetryAction(() => () => pollSessionStatus(sessionId, attempt));
    }
  }

  async function handleStartSession() {
    const validated = validateScenarioForm(scenarioForm);
    setScenarioErrors(validated);
    if (hasFlow4Errors(validated)) {
      const first = firstFlow4Error(validated);
      if (first) focusElementById(scenarioFieldIds[first]);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before starting hotline.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow4-session-start");
    await runAction(
      async () => {
        const started = (await callApi("/api/flow-4/session/start", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            partner_profile_id: selectedProfileId,
            scenario: scenarioForm.scenario,
          }),
        })) as SessionStartResponse;

        setCurrentSessionId(started.session_id);
        setCurrentSession({
          session_id: started.session_id,
          call_link_or_number: started.call_link_or_number,
          status: started.status,
          updated_at: new Date().toISOString(),
        });

        await refreshFlowState();
        setStep("result");
        await pollSessionStatus(started.session_id, 0);
      },
      "Starting strict hotline session...",
    );
  }

  function handleAuthFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode =
      submitter instanceof HTMLButtonElement &&
      submitter.dataset.authMode === "login"
        ? "login"
        : "register";
    void handleAuthSubmit(mode);
  }

  function handlePartnerFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCreatePartner();
  }

  function handleScenarioFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleStartSession();
  }

  return (
    <FlowShell moduleId="flow4">
      <FlowHeader
        eyebrow="Flow 4"
        title="AI Hotline Wizard"
        subtitle="Strict Vapi mode with mandatory partner profile and webhook-backed status updates."
        signedInEmail={user?.email ?? null}
        steps={[
          { label: "1. Auth", active: step === "auth" },
          { label: "2. Partner", active: step === "partner" },
          { label: "3. Scenario", active: step === "scenario" },
          { label: "4. Result + Status", active: step === "result" },
        ]}
        currentStepLabel={currentStepLabel}
      />

      <FlowErrorAlert
        error={error}
        loading={loading}
        panelRef={errorPanelRef}
        testId="flow4-error-panel"
        retryTestId="flow4-error-retry"
        onDismiss={() => setError(null)}
        onRetry={
          error?.retryable && retryAction
            ? () => void runAction(retryAction, "Retrying failed action...")
            : undefined
        }
      />

      {step === "auth" && (
        <FlowSection data-testid="flow4-auth-panel">
          <h2>Authenticate</h2>
          <p>Create an account or login to start Flow 4.</p>
          <form className="grid-form" onSubmit={handleAuthFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.name}>
                Name
              </label>
              <input
                id={authFieldIds.name}
                data-testid="flow4-auth-name"
                value={authForm.name}
                onChange={(event) => {
                  clearAuthFieldError("name");
                  setAuthForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow4-auth-name-help",
                  "flow4-auth-name-error",
                  Boolean(authErrors.name),
                )}
              />
              <p id="flow4-auth-name-help" className="flow-help">
                Required for registration.
              </p>
              {authErrors.name && (
                <p id="flow4-auth-name-error" className="flow-field-error">
                  {authErrors.name}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.email}>
                Email
              </label>
              <input
                id={authFieldIds.email}
                data-testid="flow4-auth-email"
                type="email"
                value={authForm.email}
                onChange={(event) => {
                  clearAuthFieldError("email");
                  setAuthForm((current) => ({ ...current, email: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.email)}
                aria-describedby={buildDescribedBy(
                  "flow4-auth-email-help",
                  "flow4-auth-email-error",
                  Boolean(authErrors.email),
                )}
              />
              <p id="flow4-auth-email-help" className="flow-help">
                Use a valid email address.
              </p>
              {authErrors.email && (
                <p id="flow4-auth-email-error" className="flow-field-error">
                  {authErrors.email}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.password}>
                Password
              </label>
              <input
                id={authFieldIds.password}
                data-testid="flow4-auth-password"
                type="password"
                value={authForm.password}
                onChange={(event) => {
                  clearAuthFieldError("password");
                  setAuthForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(authErrors.password)}
                aria-describedby={buildDescribedBy(
                  "flow4-auth-password-help",
                  "flow4-auth-password-error",
                  Boolean(authErrors.password),
                )}
              />
              <p id="flow4-auth-password-help" className="flow-help">
                Use at least 8 characters.
              </p>
              {authErrors.password && (
                <p id="flow4-auth-password-error" className="flow-field-error">
                  {authErrors.password}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button
                data-testid="flow4-auth-register"
                data-auth-mode="register"
                type="submit"
                disabled={loading}
              >
                Register
              </button>
              <button
                data-testid="flow4-auth-login"
                data-auth-mode="login"
                type="submit"
                disabled={loading}
              >
                Login
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "partner" && (
        <FlowSection data-testid="flow4-partner-panel">
          <h2>Partner Profile (Mandatory)</h2>
          <p>Select an existing partner profile or create a new one.</p>

          {profiles.length > 0 ? (
            <fieldset className="flow-fieldset" data-testid="flow4-profile-list">
              <legend className="flow-legend">Choose partner profile</legend>
              <div className="flow-list">
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className="flow-list-item"
                    data-testid={`flow4-profile-option-${profile.id}`}
                    htmlFor={`flow4-profile-radio-${profile.id}`}
                  >
                    <input
                      id={`flow4-profile-radio-${profile.id}`}
                      data-testid={`flow4-profile-radio-${profile.id}`}
                      type="radio"
                      checked={selectedProfileId === profile.id}
                      onChange={() => setSelectedProfileId(profile.id)}
                    />
                    <span>{profile.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="flow-note">No partner profiles yet. Create one below.</p>
          )}

          <form className="grid-form compact" onSubmit={handlePartnerFormSubmit} noValidate>
            <div className="flow-form-field">
              <label className="flow-label" htmlFor={partnerFieldIds.name}>
                Partner name
              </label>
              <input
                id={partnerFieldIds.name}
                data-testid="flow4-profile-name"
                value={profileForm.name}
                onChange={(event) => {
                  clearPartnerFieldError("name");
                  setProfileForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(partnerErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow4-profile-name-help",
                  "flow4-profile-name-error",
                  Boolean(partnerErrors.name),
                )}
              />
              <p id="flow4-profile-name-help" className="flow-help">
                Required.
              </p>
              {partnerErrors.name && (
                <p id="flow4-profile-name-error" className="flow-field-error">
                  {partnerErrors.name}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={partnerFieldIds.interests}>
                Interests
              </label>
              <input
                id={partnerFieldIds.interests}
                data-testid="flow4-profile-interests"
                value={profileForm.interests}
                onChange={(event) => {
                  clearPartnerFieldError("interests");
                  setProfileForm((current) => ({
                    ...current,
                    interests: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(partnerErrors.interests)}
                aria-describedby={buildDescribedBy(
                  "flow4-profile-interests-help",
                  "flow4-profile-interests-error",
                  Boolean(partnerErrors.interests),
                )}
              />
              <p id="flow4-profile-interests-help" className="flow-help">
                Example: music,dinner,travel
              </p>
              {partnerErrors.interests && (
                <p id="flow4-profile-interests-error" className="flow-field-error">
                  {partnerErrors.interests}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button data-testid="flow4-profile-create" type="submit" disabled={loading}>
                Create Profile
              </button>
              <button
                data-testid="flow4-profile-continue"
                type="button"
                disabled={loading || !selectedProfileId}
                onClick={() => setStep("scenario")}
              >
                Continue
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "scenario" && (
        <FlowSection data-testid="flow4-scenario-panel">
          <h2>Session Scenario</h2>
          <p>Define how the hotline should guide your Valentine conversation.</p>
          <form className="grid-form" onSubmit={handleScenarioFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={scenarioFieldIds.scenario}>
                Scenario
              </label>
              <div className="flow-presets" data-testid="flow4-scenario-presets">
                <button
                  type="button"
                  onClick={() =>
                    setScenarioForm({
                      scenario: "Guide me through a gentle appreciation call for my partner.",
                    })
                  }
                >
                  Appreciation
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScenarioForm({
                      scenario: "Help us play a romantic Q&A game and end with affirmations.",
                    })
                  }
                >
                  Romantic Q&A
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScenarioForm({
                      scenario: "Coach me for a sincere apology and reconnection conversation.",
                    })
                  }
                >
                  Reconnect
                </button>
              </div>
              <textarea
                id={scenarioFieldIds.scenario}
                data-testid="flow4-scenario-input"
                rows={4}
                value={scenarioForm.scenario}
                onChange={(event) => {
                  clearScenarioFieldError("scenario");
                  setScenarioForm((current) => ({
                    ...current,
                    scenario: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(scenarioErrors.scenario)}
                aria-describedby={buildDescribedBy(
                  "flow4-scenario-help",
                  "flow4-scenario-error",
                  Boolean(scenarioErrors.scenario),
                )}
              />
              <p id="flow4-scenario-help" className="flow-help">
                Keep between 2 and 300 characters.
              </p>
              {scenarioErrors.scenario && (
                <p id="flow4-scenario-error" className="flow-field-error">
                  {scenarioErrors.scenario}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button type="button" disabled={loading} onClick={() => setStep("partner")}>
                Back
              </button>
              <button data-testid="flow4-start-session" type="submit" disabled={loading}>
                Start Hotline Session
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "result" && currentSession && (
        <FlowSection tone="result" data-testid="flow4-result-panel">
          <h2 ref={resultHeadingRef} tabIndex={-1}>
            Flow 4 Session Started
          </h2>
          <FlowStatus successMessage="Session is started and visible in history." />
          <p data-testid="flow4-status-message">{statusMessage || "Polling session status..."}</p>

          <article className="flow-status-card">
            <p>Session ID: {currentSession.session_id}</p>
            <p>
              Status:{" "}
              <span
                className={`flow-status-pill ${
                  currentSession.status === "FAILED"
                    ? "failed"
                    : currentSession.status === "COMPLETED"
                      ? "completed"
                      : "active"
                }`}
              >
                {currentSession.status}
              </span>
            </p>
          </article>

          {currentSession.call_link_or_number && (
            <a
              data-testid="flow4-call-link"
              className="flow-call-link"
              href={currentSession.call_link_or_number}
              target="_blank"
              rel="noreferrer"
            >
              Open Call Link
            </a>
          )}

          <FlowActionRow>
            <button
              data-testid="flow4-refresh-status"
              type="button"
              disabled={!currentSessionId || loading}
              onClick={() => void pollSessionStatus(currentSessionId, 0)}
            >
              Refresh Status
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                stopPolling();
                setStep("scenario");
              }}
              >
                Start Another
              </button>
          </FlowActionRow>

          <h3>Recent Sessions</h3>
          {sessions.length === 0 ? (
            <p className="flow-empty">No Flow 4 sessions yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow4-history-sessions">
              {sessions.map((session) => (
                <li key={session.id} data-testid={`flow4-history-${session.id}`}>
                  <strong>{session.id}</strong> - {session.status}
                </li>
              ))}
            </ul>
          )}
        </FlowSection>
      )}

      <footer className="flow-footer">
        <Link href="/">Home</Link>
        <Link href="/flow-1">Flow 1</Link>
        <Link href="/flow-2">Flow 2</Link>
        <Link href="/flow-3">Flow 3</Link>
      </footer>
    </FlowShell>
  );
}
