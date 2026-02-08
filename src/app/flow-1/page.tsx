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
  type DateFieldKey,
  type FieldErrors,
  type PartnerFieldKey,
  firstErrorKey,
  hasFieldErrors,
  parseCommaSeparatedValues,
  validateAuthForm,
  validateDateForm,
  validatePartnerForm,
} from "@/lib/flow1/validation";

type Step = "auth" | "partner" | "date" | "result";

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

type DatePlanResponse = {
  plan_id: string;
  itinerary: Array<{ time: string; activity: string; details: string }>;
  venue_options: Array<{ name: string; reason: string; link?: string }>;
  estimated_cost: number;
  rationale: string;
  sources: {
    perplexity_links: string[];
    firecrawl_extracts_count: number;
  };
};

type ApiError = {
  error?: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
  details?: unknown;
};

const authFieldIds: Record<AuthFieldKey, string> = {
  name: "flow1-auth-name-input",
  email: "flow1-auth-email-input",
  password: "flow1-auth-password-input",
};

const partnerFieldIds: Record<PartnerFieldKey, string> = {
  name: "flow1-profile-name-input",
  interests: "flow1-profile-interests-input",
};

const dateFieldIds: Record<DateFieldKey, string> = {
  city: "flow1-date-city-input",
  budget: "flow1-date-budget-input",
  vibe: "flow1-date-vibe-input",
  date_time: "flow1-date-time-input",
};

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

function buildDescribedBy(helpId: string, errorId: string, hasError: boolean) {
  return hasError ? `${helpId} ${errorId}` : helpId;
}

function focusElementById(id: string) {
  const element = document.getElementById(id);
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

function focusFirstErrorField<Key extends string>(
  errors: FieldErrors<Key>,
  fieldIds: Record<Key, string>,
) {
  const firstError = firstErrorKey(errors);
  if (!firstError) return;
  focusElementById(fieldIds[firstError]);
}

function createIdempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`;
}

export default function FlowOnePage() {
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [result, setResult] = useState<DatePlanResponse | null>(null);
  const [history, setHistory] = useState<DatePlanResponse[]>([]);
  const [error, setError] = useState<{
    message: string;
    code?: string;
    retryable?: boolean;
    provider?: string;
  } | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );

  const [authErrors, setAuthErrors] = useState<FieldErrors<AuthFieldKey>>({});
  const [partnerErrors, setPartnerErrors] = useState<FieldErrors<PartnerFieldKey>>(
    {},
  );
  const [dateErrors, setDateErrors] = useState<FieldErrors<DateFieldKey>>({});

  const errorPanelRef = useRef<HTMLElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

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
  const [dateForm, setDateForm] = useState({
    city: "New York",
    budget: 180,
    vibe: "cozy romantic",
    dietary: "",
    date_time: "",
  });

  const currentStepLabel = useMemo(() => {
    switch (step) {
      case "auth":
        return "Auth";
      case "partner":
        return "Partner";
      case "date":
        return "Date";
      case "result":
        return "Result";
      default:
        return "Flow";
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
    if (step === "date") {
      focusElementById(dateFieldIds.city);
      return;
    }
    if (step === "result") {
      resultHeadingRef.current?.focus();
    }
  }, [step]);

  function clearAuthFieldError(field: AuthFieldKey) {
    setAuthErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearPartnerFieldError(field: PartnerFieldKey) {
    setPartnerErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearDateFieldError(field: DateFieldKey) {
    setDateErrors((current) => ({ ...current, [field]: undefined }));
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
    const flow = (await callApi("/api/history/flow-1", { method: "GET" })) as {
      partner_profiles: PartnerProfile[];
      date_plans: Array<{
        id: string;
        itinerary: DatePlanResponse["itinerary"];
        venueOptions: DatePlanResponse["venue_options"];
        estimatedCost: number;
        rationale: string;
        providerMeta?: { sources?: DatePlanResponse["sources"] };
      }>;
    };

    setProfiles(flow.partner_profiles);
    if (flow.partner_profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(flow.partner_profiles[0]!.id);
    }

    const mappedHistory: DatePlanResponse[] = flow.date_plans.map((item) => ({
      plan_id: item.id,
      itinerary: item.itinerary,
      venue_options: item.venueOptions,
      estimated_cost: item.estimatedCost,
      rationale: item.rationale,
      sources: item.providerMeta?.sources ?? {
        perplexity_links: [],
        firecrawl_extracts_count: 0,
      },
    }));
    setHistory(mappedHistory);
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
      "Loading Flow 1...",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAuthSubmit(mode: AuthSubmitMode) {
    const validated = validateAuthForm(authForm, mode);
    setAuthErrors(validated);
    if (hasFieldErrors(validated)) {
      focusFirstErrorField(validated, authFieldIds);
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

  async function handlePartnerCreateSubmit() {
    const validated = validatePartnerForm({
      name: profileForm.name,
      interests: profileForm.interests,
    });
    setPartnerErrors(validated);
    if (hasFieldErrors(validated)) {
      focusFirstErrorField(validated, partnerFieldIds);
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow1-partner-profile");
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

  async function handleDateGenerateSubmit() {
    const validated = validateDateForm(dateForm);
    setDateErrors(validated);
    if (hasFieldErrors(validated)) {
      focusFirstErrorField(validated, dateFieldIds);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before generating a plan.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow1-date-plan");
    await runAction(
      async () => {
        const generated = (await callApi("/api/plan/date", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            ...dateForm,
            budget: Number(dateForm.budget),
            date_time: dateForm.date_time || undefined,
            partner_profile_id: selectedProfileId,
          }),
        })) as DatePlanResponse;

        setResult(generated);
        await refreshFlowState();
        setStep("result");
      },
      "Generating your date plan...",
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
    void handlePartnerCreateSubmit();
  }

  function handleDateFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleDateGenerateSubmit();
  }

  return (
    <FlowShell moduleId="flow1">
      <FlowHeader
        eyebrow="Flow 1"
        title="Onboarding + Date Plan"
        subtitle="Plan a personalized date with partner profile context and saved history."
        signedInEmail={user?.email ?? null}
        steps={[
          { label: "1. Auth", active: step === "auth" },
          { label: "2. Partner", active: step === "partner" },
          { label: "3. Date Plan", active: step === "date" },
          { label: "4. Result", active: step === "result" },
        ]}
        currentStepLabel={currentStepLabel}
      />

      <FlowErrorAlert
        error={error}
        loading={loading}
        panelRef={errorPanelRef}
        testId="flow1-error-panel"
        retryTestId="flow1-error-retry"
        onDismiss={() => setError(null)}
        onRetry={
          error?.retryable && retryAction
            ? () => void runAction(retryAction, "Retrying failed action...")
            : undefined
        }
      />

      {step === "auth" && (
        <FlowSection data-testid="flow1-auth-panel">
          <h2 id="flow1-auth-heading">Authenticate</h2>
          <p>Create an account or login to start Flow 1.</p>
          <form className="grid-form" onSubmit={handleAuthFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.name}>
                Name
              </label>
              <input
                id={authFieldIds.name}
                data-testid="flow1-auth-name"
                placeholder="Name"
                value={authForm.name}
                onChange={(event) => {
                  clearAuthFieldError("name");
                  setAuthForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow1-auth-name-help",
                  "flow1-auth-name-error",
                  Boolean(authErrors.name),
                )}
              />
              <p id="flow1-auth-name-help" className="flow-help">
                Required for registration. Optional for login.
              </p>
              {authErrors.name && (
                <p id="flow1-auth-name-error" className="flow-field-error">
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
                data-testid="flow1-auth-email"
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(event) => {
                  clearAuthFieldError("email");
                  setAuthForm((current) => ({ ...current, email: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.email)}
                aria-describedby={buildDescribedBy(
                  "flow1-auth-email-help",
                  "flow1-auth-email-error",
                  Boolean(authErrors.email),
                )}
              />
              <p id="flow1-auth-email-help" className="flow-help">
                Use a valid email like name@example.com.
              </p>
              {authErrors.email && (
                <p id="flow1-auth-email-error" className="flow-field-error">
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
                data-testid="flow1-auth-password"
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(event) => {
                  clearAuthFieldError("password");
                  setAuthForm((current) => ({ ...current, password: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.password)}
                aria-describedby={buildDescribedBy(
                  "flow1-auth-password-help",
                  "flow1-auth-password-error",
                  Boolean(authErrors.password),
                )}
              />
              <p id="flow1-auth-password-help" className="flow-help">
                Use at least 8 characters.
              </p>
              {authErrors.password && (
                <p id="flow1-auth-password-error" className="flow-field-error">
                  {authErrors.password}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button
                data-testid="flow1-auth-register"
                data-auth-mode="register"
                type="submit"
                disabled={loading}
              >
                Register
              </button>
              <button
                data-testid="flow1-auth-login"
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
        <FlowSection data-testid="flow1-partner-panel">
          <h2 id="flow1-partner-heading">Partner Profile (Mandatory)</h2>
          <p>Select an existing partner profile or create a new one.</p>

          {profiles.length > 0 ? (
            <fieldset className="flow-fieldset" data-testid="flow1-profile-list">
              <legend className="flow-legend">Choose a saved partner profile</legend>
              <div className="flow-list">
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className="flow-list-item"
                    data-testid={`flow1-profile-option-${profile.id}`}
                    htmlFor={`flow1-profile-radio-${profile.id}`}
                  >
                    <input
                      id={`flow1-profile-radio-${profile.id}`}
                      data-testid={`flow1-profile-radio-${profile.id}`}
                      name="selected-profile"
                      type="radio"
                      checked={selectedProfileId === profile.id}
                      onChange={() => setSelectedProfileId(profile.id)}
                    />
                    <span>
                      {profile.name}
                      {profile.notes ? ` - ${profile.notes}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="flow-note">
              No partner profiles yet. Create one below to continue Flow 1.
            </p>
          )}

          <form className="grid-form compact" onSubmit={handlePartnerFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={partnerFieldIds.name}>
                Partner name
              </label>
              <input
                id={partnerFieldIds.name}
                data-testid="flow1-profile-name"
                placeholder="Partner name"
                value={profileForm.name}
                onChange={(event) => {
                  clearPartnerFieldError("name");
                  setProfileForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(partnerErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow1-profile-name-help",
                  "flow1-profile-name-error",
                  Boolean(partnerErrors.name),
                )}
              />
              <p id="flow1-profile-name-help" className="flow-help">
                Enter your partner&apos;s name as you want it shown in plans.
              </p>
              {partnerErrors.name && (
                <p id="flow1-profile-name-error" className="flow-field-error">
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
                data-testid="flow1-profile-interests"
                placeholder="Interests comma-separated"
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
                  "flow1-profile-interests-help",
                  "flow1-profile-interests-error",
                  Boolean(partnerErrors.interests),
                )}
              />
              <p id="flow1-profile-interests-help" className="flow-help">
                Example: music,dinner,travel
              </p>
              {partnerErrors.interests && (
                <p id="flow1-profile-interests-error" className="flow-field-error">
                  {partnerErrors.interests}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow1-profile-dislikes-input">
                Dislikes
              </label>
              <input
                id="flow1-profile-dislikes-input"
                data-testid="flow1-profile-dislikes"
                placeholder="Dislikes comma-separated"
                value={profileForm.dislikes}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    dislikes: event.target.value,
                  }))
                }
                aria-describedby="flow1-profile-dislikes-help"
              />
              <p id="flow1-profile-dislikes-help" className="flow-help">
                Optional context to avoid poor matches.
              </p>
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow1-profile-notes-input">
                Notes
              </label>
              <textarea
                id="flow1-profile-notes-input"
                data-testid="flow1-profile-notes"
                rows={2}
                placeholder="Notes"
                value={profileForm.notes}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                aria-describedby="flow1-profile-notes-help"
              />
              <p id="flow1-profile-notes-help" className="flow-help">
                Optional details like favorite places or pacing preferences.
              </p>
            </div>

            <FlowActionRow>
              <button data-testid="flow1-profile-create" type="submit" disabled={loading}>
                Create Profile
              </button>
              <button
                data-testid="flow1-profile-continue"
                type="button"
                onClick={() => setStep("date")}
                disabled={loading || !selectedProfileId}
              >
                Continue
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "date" && (
        <FlowSection data-testid="flow1-date-panel">
          <h2 id="flow1-date-heading">Generate Date Plan</h2>
          <p>
            Share preferences and get an itinerary with venue ideas and cost guidance.
          </p>
          <form className="grid-form" onSubmit={handleDateFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={dateFieldIds.city}>
                City
              </label>
              <input
                id={dateFieldIds.city}
                data-testid="flow1-date-city"
                placeholder="City"
                value={dateForm.city}
                onChange={(event) => {
                  clearDateFieldError("city");
                  setDateForm((current) => ({ ...current, city: event.target.value }));
                }}
                aria-invalid={Boolean(dateErrors.city)}
                aria-describedby={buildDescribedBy(
                  "flow1-date-city-help",
                  "flow1-date-city-error",
                  Boolean(dateErrors.city),
                )}
              />
              <p id="flow1-date-city-help" className="flow-help">
                US city for venue and activity recommendations.
              </p>
              {dateErrors.city && (
                <p id="flow1-date-city-error" className="flow-field-error">
                  {dateErrors.city}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={dateFieldIds.budget}>
                Budget (USD)
              </label>
              <input
                id={dateFieldIds.budget}
                data-testid="flow1-date-budget"
                type="number"
                min={1}
                step={1}
                placeholder="Budget"
                value={dateForm.budget}
                onChange={(event) => {
                  clearDateFieldError("budget");
                  setDateForm((current) => ({
                    ...current,
                    budget: Number(event.target.value),
                  }));
                }}
                aria-invalid={Boolean(dateErrors.budget)}
                aria-describedby={buildDescribedBy(
                  "flow1-date-budget-help",
                  "flow1-date-budget-error",
                  Boolean(dateErrors.budget),
                )}
              />
              <p id="flow1-date-budget-help" className="flow-help">
                Enter a positive number.
              </p>
              {dateErrors.budget && (
                <p id="flow1-date-budget-error" className="flow-field-error">
                  {dateErrors.budget}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={dateFieldIds.vibe}>
                Vibe
              </label>
              <input
                id={dateFieldIds.vibe}
                data-testid="flow1-date-vibe"
                placeholder="Vibe"
                value={dateForm.vibe}
                onChange={(event) => {
                  clearDateFieldError("vibe");
                  setDateForm((current) => ({ ...current, vibe: event.target.value }));
                }}
                aria-invalid={Boolean(dateErrors.vibe)}
                aria-describedby={buildDescribedBy(
                  "flow1-date-vibe-help",
                  "flow1-date-vibe-error",
                  Boolean(dateErrors.vibe),
                )}
              />
              <p id="flow1-date-vibe-help" className="flow-help">
                Example: cozy romantic, fun adventurous, or elegant night-out.
              </p>
              {dateErrors.vibe && (
                <p id="flow1-date-vibe-error" className="flow-field-error">
                  {dateErrors.vibe}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow1-date-dietary-input">
                Dietary preferences
              </label>
              <input
                id="flow1-date-dietary-input"
                data-testid="flow1-date-dietary"
                placeholder="Dietary"
                value={dateForm.dietary}
                onChange={(event) =>
                  setDateForm((current) => ({
                    ...current,
                    dietary: event.target.value,
                  }))
                }
                aria-describedby="flow1-date-dietary-help"
              />
              <p id="flow1-date-dietary-help" className="flow-help">
                Optional (for example: vegetarian, nut-free, halal).
              </p>
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={dateFieldIds.date_time}>
                Date time (ISO optional)
              </label>
              <input
                id={dateFieldIds.date_time}
                data-testid="flow1-date-time"
                placeholder="Date time (ISO optional)"
                value={dateForm.date_time}
                onChange={(event) => {
                  clearDateFieldError("date_time");
                  setDateForm((current) => ({
                    ...current,
                    date_time: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(dateErrors.date_time)}
                aria-describedby={buildDescribedBy(
                  "flow1-date-time-help",
                  "flow1-date-time-error",
                  Boolean(dateErrors.date_time),
                )}
              />
              <p id="flow1-date-time-help" className="flow-help">
                Optional ISO value like 2026-02-14T19:00:00.000Z.
              </p>
              {dateErrors.date_time && (
                <p id="flow1-date-time-error" className="flow-field-error">
                  {dateErrors.date_time}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button type="button" onClick={() => setStep("partner")} disabled={loading}>
                Back
              </button>
              <button
                data-testid="flow1-date-submit"
                type="submit"
                disabled={loading || !selectedProfileId}
              >
                Generate Plan
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "result" && result && (
        <FlowSection tone="result" data-testid="flow1-result-panel">
          <h2 id="flow1-result-heading" ref={resultHeadingRef} tabIndex={-1}>
            Flow 1 Completed
          </h2>
          <FlowStatus
            successMessage="Plan saved successfully. You can generate another plan now."
          />

          <div className="flow-kpi-grid">
            <article className="flow-kpi">
              <strong>{result.plan_id}</strong>
              <span>Saved plan ID</span>
            </article>
            <article className="flow-kpi">
              <strong>${result.estimated_cost}</strong>
              <span>Estimated cost</span>
            </article>
            <article className="flow-kpi">
              <strong>{result.sources.perplexity_links.length}</strong>
              <span>Source links</span>
            </article>
          </div>
          <p>Saved plan ID: {result.plan_id}</p>
          <p>Estimated cost: ${result.estimated_cost}</p>

          <p>{result.rationale}</p>

          <h3>Itinerary</h3>
          <div className="flow-timeline" data-testid="flow1-itinerary-timeline">
            {result.itinerary.map((item, index) => (
              <article className="flow-timeline-item" key={`${item.time}-${index}`}>
                <span className="flow-timeline-time">{item.time}</span>
                <h4>{item.activity}</h4>
                <p>{item.details}</p>
              </article>
            ))}
          </div>

          <h3>Evidence</h3>
          <div className="flow-chip-row">
            <span className="flow-chip">
              Perplexity links: {result.sources.perplexity_links.length}
            </span>
            <span className="flow-chip">
              Firecrawl extracts: {result.sources.firecrawl_extracts_count}
            </span>
          </div>
          {result.sources.perplexity_links.length > 0 ? (
            <ul className="flow-ul">
              {result.sources.perplexity_links.map((link) => (
                <li key={link}>
                  <a href={link} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flow-empty">
              No source links returned for this plan, but metadata was saved.
            </p>
          )}

          <h3>Recent Flow 1 History</h3>
          {history.length === 0 ? (
            <p className="flow-empty">
              No saved plans yet. Generate your first plan to populate history.
            </p>
          ) : (
            <ul className="flow-ul" data-testid="flow1-history-list">
              {history.map((item) => (
                <li key={item.plan_id} data-testid={`flow1-history-item-${item.plan_id}`}>
                  <strong>{item.plan_id}</strong> - ${item.estimated_cost}
                </li>
              ))}
            </ul>
          )}

          <FlowActionRow sticky>
            <button onClick={() => setStep("date")} disabled={loading}>
              Generate Another
            </button>
            <Link className="flow-link-button" href="/">
              Back to Home
            </Link>
          </FlowActionRow>
        </FlowSection>
      )}

      <footer className="flow-footer">
        <Link href="/">Home</Link>
        <Link href="/?dashboard=1">Dashboard</Link>
      </footer>
    </FlowShell>
  );
}
