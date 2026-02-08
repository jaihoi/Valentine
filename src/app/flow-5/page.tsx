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
  type GiftFieldKey,
  firstErrorKey as firstFlow5Error,
  hasFieldErrors as hasFlow5Errors,
  parseGiftInterests,
  validateGiftForm,
} from "@/lib/flow5/validation";

type Step = "auth" | "partner" | "gift-input" | "result";

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

type GiftSuggestion = {
  title: string;
  reason: string;
  estimated_price: number;
};

type GiftHistoryItem = {
  id: string;
  partnerProfileId?: string | null;
  interests: string[];
  budget: number;
  constraints?: string | null;
  recommendations: GiftSuggestion[];
  explanation: string;
  links: string[];
  providerMeta?: Record<string, unknown>;
  createdAt: string;
};

type Flow5HistoryResponse = {
  partner_profiles: PartnerProfile[];
  gift_recommendations: GiftHistoryItem[];
};

type Flow5GiftResponse = {
  gift_recommendation_id: string;
  recommendations: GiftSuggestion[];
  explanation: string;
  links: string[];
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

type ErrorState = {
  message: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
};

const authFieldIds: Record<AuthFieldKey, string> = {
  name: "flow5-auth-name-input",
  email: "flow5-auth-email-input",
  password: "flow5-auth-password-input",
};

const partnerFieldIds: Record<PartnerFieldKey, string> = {
  name: "flow5-profile-name-input",
  interests: "flow5-profile-interests-input",
};

const giftFieldIds: Record<GiftFieldKey, string> = {
  interests: "flow5-gift-interests-input",
  budget: "flow5-gift-budget-input",
  constraints: "flow5-gift-constraints-input",
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

export default function FlowFivePage() {
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [historyGifts, setHistoryGifts] = useState<GiftHistoryItem[]>([]);
  const [latestGift, setLatestGift] = useState<Flow5GiftResponse | null>(null);

  const [error, setError] = useState<ErrorState | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);

  const [authErrors, setAuthErrors] = useState<Partial<Record<AuthFieldKey, string>>>(
    {},
  );
  const [partnerErrors, setPartnerErrors] = useState<
    Partial<Record<PartnerFieldKey, string>>
  >({});
  const [giftErrors, setGiftErrors] = useState<Partial<Record<GiftFieldKey, string>>>(
    {},
  );

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
  const [giftForm, setGiftForm] = useState({
    interests: "music,coffee",
    budget: "120",
    constraints: "",
  });

  const errorPanelRef = useRef<HTMLElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const currentStepLabel = useMemo(() => {
    switch (step) {
      case "auth":
        return "Auth";
      case "partner":
        return "Partner";
      case "gift-input":
        return "Gift Input";
      case "result":
        return "Result";
      default:
        return "Flow 5";
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
    if (step === "gift-input") {
      focusElementById(giftFieldIds.interests);
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

  function clearGiftFieldError(field: GiftFieldKey) {
    setGiftErrors((current) => ({ ...current, [field]: undefined }));
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
    const flow = (await callApi("/api/history/flow-5", {
      method: "GET",
    })) as Flow5HistoryResponse;

    setProfiles(flow.partner_profiles);
    if (flow.partner_profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(flow.partner_profiles[0]!.id);
    }
    setHistoryGifts(flow.gift_recommendations);
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
      "Loading Flow 5...",
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

    const idempotencyKey = createIdempotencyKey("flow5-partner-profile");
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

  async function handleGiftGenerate() {
    const validated = validateGiftForm({
      interestsText: giftForm.interests,
      budgetText: giftForm.budget,
      constraints: giftForm.constraints,
    });
    setGiftErrors(validated);
    if (hasFlow5Errors(validated)) {
      const first = firstFlow5Error(validated);
      if (first) focusElementById(giftFieldIds[first]);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before generating gifts.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow5-gift-generate");
    await runAction(
      async () => {
        const generated = (await callApi("/api/flow-5/gifts/recommend", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            partner_profile_id: selectedProfileId,
            interests: parseGiftInterests(giftForm.interests),
            budget: Number(giftForm.budget),
            constraints: giftForm.constraints.trim() || undefined,
          }),
        })) as Flow5GiftResponse;

        setLatestGift(generated);
        await refreshFlowState();
        setStatusMessage("Gift recommendation saved successfully.");
        setStep("result");
      },
      "Generating your gift recommendations...",
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

  function handleGiftFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleGiftGenerate();
  }

  return (
    <FlowShell moduleId="flow5">
      <FlowHeader
        eyebrow="Flow 5"
        title="Gift Finder Wizard"
        subtitle="Get personalized gift recommendations with mandatory partner context and saved history."
        signedInEmail={user?.email ?? null}
        steps={[
          { label: "1. Auth", active: step === "auth" },
          { label: "2. Partner", active: step === "partner" },
          { label: "3. Gift Input", active: step === "gift-input" },
          { label: "4. Result + History", active: step === "result" },
        ]}
        currentStepLabel={currentStepLabel}
      />

      <FlowErrorAlert
        error={error}
        loading={loading}
        panelRef={errorPanelRef}
        testId="flow5-error-panel"
        retryTestId="flow5-error-retry"
        onDismiss={() => setError(null)}
        onRetry={
          error?.retryable && retryAction
            ? () => void runAction(retryAction, "Retrying failed action...")
            : undefined
        }
      />

      {step === "auth" && (
        <FlowSection data-testid="flow5-auth-panel">
          <h2>Authenticate</h2>
          <p>Create an account or login to start Flow 5.</p>
          <form className="grid-form" onSubmit={handleAuthFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.name}>
                Name
              </label>
              <input
                id={authFieldIds.name}
                data-testid="flow5-auth-name"
                value={authForm.name}
                onChange={(event) => {
                  clearAuthFieldError("name");
                  setAuthForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow5-auth-name-help",
                  "flow5-auth-name-error",
                  Boolean(authErrors.name),
                )}
              />
              <p id="flow5-auth-name-help" className="flow-help">
                Required for registration.
              </p>
              {authErrors.name && (
                <p id="flow5-auth-name-error" className="flow-field-error">
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
                data-testid="flow5-auth-email"
                type="email"
                value={authForm.email}
                onChange={(event) => {
                  clearAuthFieldError("email");
                  setAuthForm((current) => ({ ...current, email: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.email)}
                aria-describedby={buildDescribedBy(
                  "flow5-auth-email-help",
                  "flow5-auth-email-error",
                  Boolean(authErrors.email),
                )}
              />
              <p id="flow5-auth-email-help" className="flow-help">
                Use a valid email address.
              </p>
              {authErrors.email && (
                <p id="flow5-auth-email-error" className="flow-field-error">
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
                data-testid="flow5-auth-password"
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
                  "flow5-auth-password-help",
                  "flow5-auth-password-error",
                  Boolean(authErrors.password),
                )}
              />
              <p id="flow5-auth-password-help" className="flow-help">
                Use at least 8 characters.
              </p>
              {authErrors.password && (
                <p id="flow5-auth-password-error" className="flow-field-error">
                  {authErrors.password}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button
                data-testid="flow5-auth-register"
                data-auth-mode="register"
                type="submit"
                disabled={loading}
              >
                Register
              </button>
              <button
                data-testid="flow5-auth-login"
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
        <FlowSection data-testid="flow5-partner-panel">
          <h2>Partner Profile (Mandatory)</h2>
          <p>Select an existing partner profile or create a new one.</p>

          {profiles.length > 0 ? (
            <fieldset className="flow-fieldset" data-testid="flow5-profile-list">
              <legend className="flow-legend">Choose partner profile</legend>
              <div className="flow-list">
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className="flow-list-item"
                    data-testid={`flow5-profile-option-${profile.id}`}
                    htmlFor={`flow5-profile-radio-${profile.id}`}
                  >
                    <input
                      id={`flow5-profile-radio-${profile.id}`}
                      data-testid={`flow5-profile-radio-${profile.id}`}
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
                data-testid="flow5-profile-name"
                value={profileForm.name}
                onChange={(event) => {
                  clearPartnerFieldError("name");
                  setProfileForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(partnerErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow5-profile-name-help",
                  "flow5-profile-name-error",
                  Boolean(partnerErrors.name),
                )}
              />
              <p id="flow5-profile-name-help" className="flow-help">
                Required.
              </p>
              {partnerErrors.name && (
                <p id="flow5-profile-name-error" className="flow-field-error">
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
                data-testid="flow5-profile-interests"
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
                  "flow5-profile-interests-help",
                  "flow5-profile-interests-error",
                  Boolean(partnerErrors.interests),
                )}
              />
              <p id="flow5-profile-interests-help" className="flow-help">
                Example: music,dinner,travel
              </p>
              {partnerErrors.interests && (
                <p id="flow5-profile-interests-error" className="flow-field-error">
                  {partnerErrors.interests}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button data-testid="flow5-profile-create" type="submit" disabled={loading}>
                Create Profile
              </button>
              <button
                data-testid="flow5-profile-continue"
                type="button"
                disabled={loading || !selectedProfileId}
                onClick={() => setStep("gift-input")}
              >
                Continue
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "gift-input" && (
        <FlowSection data-testid="flow5-gift-panel">
          <h2>Gift Preferences</h2>
          <p>Generate gift recommendations tailored to interests and budget.</p>
          <form className="grid-form" onSubmit={handleGiftFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={giftFieldIds.interests}>
                Interests
              </label>
              <input
                id={giftFieldIds.interests}
                data-testid="flow5-gift-interests"
                value={giftForm.interests}
                onChange={(event) => {
                  clearGiftFieldError("interests");
                  setGiftForm((current) => ({
                    ...current,
                    interests: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(giftErrors.interests)}
                aria-describedby={buildDescribedBy(
                  "flow5-gift-interests-help",
                  "flow5-gift-interests-error",
                  Boolean(giftErrors.interests),
                )}
              />
              <p id="flow5-gift-interests-help" className="flow-help">
                Example: music,coffee,travel
              </p>
              {giftErrors.interests && (
                <p id="flow5-gift-interests-error" className="flow-field-error">
                  {giftErrors.interests}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={giftFieldIds.budget}>
                Budget (USD)
              </label>
              <input
                id={giftFieldIds.budget}
                data-testid="flow5-gift-budget"
                type="number"
                inputMode="numeric"
                value={giftForm.budget}
                onChange={(event) => {
                  clearGiftFieldError("budget");
                  setGiftForm((current) => ({
                    ...current,
                    budget: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(giftErrors.budget)}
                aria-describedby={buildDescribedBy(
                  "flow5-gift-budget-help",
                  "flow5-gift-budget-error",
                  Boolean(giftErrors.budget),
                )}
              />
              <p id="flow5-gift-budget-help" className="flow-help">
                Whole number between 1 and 100000.
              </p>
              {giftErrors.budget && (
                <p id="flow5-gift-budget-error" className="flow-field-error">
                  {giftErrors.budget}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={giftFieldIds.constraints}>
                Constraints
              </label>
              <textarea
                id={giftFieldIds.constraints}
                data-testid="flow5-gift-constraints"
                rows={3}
                value={giftForm.constraints}
                onChange={(event) => {
                  clearGiftFieldError("constraints");
                  setGiftForm((current) => ({
                    ...current,
                    constraints: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(giftErrors.constraints)}
                aria-describedby={buildDescribedBy(
                  "flow5-gift-constraints-help",
                  "flow5-gift-constraints-error",
                  Boolean(giftErrors.constraints),
                )}
              />
              <p id="flow5-gift-constraints-help" className="flow-help">
                Optional. Max 300 characters.
              </p>
              {giftErrors.constraints && (
                <p id="flow5-gift-constraints-error" className="flow-field-error">
                  {giftErrors.constraints}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button type="button" disabled={loading} onClick={() => setStep("partner")}>
                Back
              </button>
              <button data-testid="flow5-gift-submit" type="submit" disabled={loading}>
                Generate Gifts
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "result" && latestGift && (
        <FlowSection tone="result" data-testid="flow5-result-panel">
          <h2 ref={resultHeadingRef} tabIndex={-1}>
            Flow 5 Recommendation Saved
          </h2>
          <FlowStatus successMessage={statusMessage || "Recommendation saved successfully."} />
          <p data-testid="flow5-result-id">
            Recommendation ID: {latestGift.gift_recommendation_id}
          </p>
          <div className="flow-chip-row" data-testid="flow5-result-sources">
            <span className="flow-chip">
              Sources: {latestGift.sources.perplexity_links.length} links
            </span>
            <span className="flow-chip">
              Firecrawl extracts: {latestGift.sources.firecrawl_extracts_count}
            </span>
          </div>

          <h3>Recommended Gifts</h3>
          <ol className="flow-ul" data-testid="flow5-result-recommendations">
            {latestGift.recommendations.map((item, index) => (
              <li className="flow-result-card" key={`${item.title}-${index}`}>
                <h4>
                  #{index + 1} {item.title}
                </h4>
                <p>
                  Estimated price: <strong>${item.estimated_price}</strong>
                </p>
                <p>{item.reason}</p>
              </li>
            ))}
          </ol>

          <p data-testid="flow5-result-explanation">{latestGift.explanation}</p>
          {latestGift.links.length > 0 && (
            <>
              <h3>Reference links</h3>
              <ul className="flow-ul">
                {latestGift.links.map((link) => (
                  <li key={link}>
                    <a href={link} target="_blank" rel="noreferrer">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <FlowActionRow>
            <button
              type="button"
              onClick={() => setStep("gift-input")}
              disabled={loading}
            >
              Generate Another
            </button>
            <button
              type="button"
              onClick={() => void refreshFlowState()}
              disabled={loading}
            >
              Refresh History
            </button>
          </FlowActionRow>

          <h3>Recent Gift History</h3>
          {historyGifts.length === 0 ? (
            <p className="flow-empty">No gifts saved yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow5-history-gifts">
              {historyGifts.map((gift) => (
                <li key={gift.id} data-testid={`flow5-history-${gift.id}`}>
                  <strong>{gift.id}</strong> - Budget ${gift.budget} -{" "}
                  {gift.recommendations.length} recommendations
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
        <Link href="/flow-4">Flow 4</Link>
        <Link href="/flow-5">Flow 5</Link>
      </footer>
    </FlowShell>
  );
}
