"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  type LetterFieldKey,
  type VoiceFieldKey,
  firstErrorKey as firstFlow2Error,
  hasFieldErrors as hasFlow2Errors,
  parseMemories,
  validateLetterForm,
  validateVoiceForm,
} from "@/lib/flow2/validation";

type Step = "auth" | "partner" | "letter-input" | "letter-result" | "voice" | "result";

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

type LetterResponse = {
  letter_content_id: string;
  letter_text: string;
  short_sms: string;
  caption_versions: string[];
};

type VoiceResponse = {
  audio_asset_id: string;
  audio_url: string;
};

type HistoryLetter = {
  id: string;
  content: string;
  createdAt: string;
};

type HistoryVoiceAsset = {
  id: string;
  sourceText: string;
  audioUrl: string;
  createdAt: string;
};

type ApiError = {
  error?: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
  details?: unknown;
};

const authFieldIds: Record<AuthFieldKey, string> = {
  name: "flow2-auth-name-input",
  email: "flow2-auth-email-input",
  password: "flow2-auth-password-input",
};

const partnerFieldIds: Record<PartnerFieldKey, string> = {
  name: "flow2-profile-name-input",
  interests: "flow2-profile-interests-input",
};

const letterFieldIds: Record<LetterFieldKey, string> = {
  tone: "flow2-letter-tone-input",
  length: "flow2-letter-length-input",
  memories: "flow2-letter-memories-input",
};

const voiceFieldIds: Record<VoiceFieldKey, string> = {
  source_content_id: "flow2-letter-source-selector",
  text: "flow2-voice-text-input",
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

function submitOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  submit: () => void,
) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function createIdempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`;
}

export default function FlowTwoPage() {
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const [generatedLetter, setGeneratedLetter] = useState<LetterResponse | null>(null);
  const [voiceAsset, setVoiceAsset] = useState<VoiceResponse | null>(null);
  const [historyLetters, setHistoryLetters] = useState<HistoryLetter[]>([]);
  const [historyVoiceAssets, setHistoryVoiceAssets] = useState<HistoryVoiceAsset[]>([]);

  const [error, setError] = useState<{
    message: string;
    code?: string;
    retryable?: boolean;
    provider?: string;
  } | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );

  const [authErrors, setAuthErrors] = useState<Partial<Record<AuthFieldKey, string>>>(
    {},
  );
  const [partnerErrors, setPartnerErrors] = useState<
    Partial<Record<PartnerFieldKey, string>>
  >({});
  const [letterErrors, setLetterErrors] = useState<
    Partial<Record<LetterFieldKey, string>>
  >({});
  const [voiceErrors, setVoiceErrors] = useState<
    Partial<Record<VoiceFieldKey, string>>
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
  const [letterForm, setLetterForm] = useState({
    tone: "warm and romantic",
    length: "medium" as "short" | "medium" | "long",
    memoriesText: "our first coffee date;our weekend road trip",
  });
  const [voiceForm, setVoiceForm] = useState({
    text: "",
    voice_id: "",
    style: "romantic",
  });
  const [selectedVoiceSource, setSelectedVoiceSource] = useState("letter");

  const errorPanelRef = useRef<HTMLElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const currentStepLabel = useMemo(() => {
    switch (step) {
      case "auth":
        return "Auth";
      case "partner":
        return "Partner";
      case "letter-input":
        return "Letter Input";
      case "letter-result":
        return "Letter Result";
      case "voice":
        return "Voice";
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
    if (step === "letter-input") {
      focusElementById(letterFieldIds.tone);
      return;
    }
    if (step === "letter-result") {
      focusElementById("flow2-letter-result-heading");
      return;
    }
    if (step === "voice") {
      focusElementById(voiceFieldIds.text);
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

  function clearLetterFieldError(field: LetterFieldKey) {
    setLetterErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearVoiceFieldError(field: VoiceFieldKey) {
    setVoiceErrors((current) => ({ ...current, [field]: undefined }));
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
    const flow = (await callApi("/api/history/flow-2", { method: "GET" })) as {
      partner_profiles: PartnerProfile[];
      letters: HistoryLetter[];
      voice_assets: HistoryVoiceAsset[];
    };

    setProfiles(flow.partner_profiles);
    if (flow.partner_profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(flow.partner_profiles[0]!.id);
    }
    setHistoryLetters(flow.letters);
    setHistoryVoiceAssets(flow.voice_assets);
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
      "Loading Flow 2...",
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

    const idempotencyKey = createIdempotencyKey("flow2-partner-profile");
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

  async function handleGenerateLetter() {
    const validated = validateLetterForm(letterForm);
    setLetterErrors(validated);
    if (hasFlow2Errors(validated)) {
      const first = firstFlow2Error(validated);
      if (first) focusElementById(letterFieldIds[first]);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before generating a letter.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow2-love-letter");
    await runAction(
      async () => {
        const generated = (await callApi("/api/flow-2/love-letter", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            partner_profile_id: selectedProfileId,
            tone: letterForm.tone,
            length: letterForm.length,
            memories: parseMemories(letterForm.memoriesText),
          }),
        })) as LetterResponse;

        setGeneratedLetter(generated);
        setSelectedVoiceSource("letter");
        setVoiceForm((current) => ({ ...current, text: generated.letter_text }));
        await refreshFlowState();
        setStep("letter-result");
      },
      "Generating strict love letter...",
    );
  }

  function getSourceText(source: string): string {
    if (!generatedLetter) return "";
    if (source === "letter") return generatedLetter.letter_text;
    if (source === "sms") return generatedLetter.short_sms;
    if (source.startsWith("caption-")) {
      const index = Number(source.replace("caption-", ""));
      return generatedLetter.caption_versions[index] ?? generatedLetter.letter_text;
    }
    return generatedLetter.letter_text;
  }

  function handleSelectVoiceSource(source: string) {
    setSelectedVoiceSource(source);
    clearVoiceFieldError("text");
    setVoiceForm((current) => ({ ...current, text: getSourceText(source) }));
  }

  async function handleGenerateVoice() {
    const sourceContentId = generatedLetter?.letter_content_id ?? "";
    const validated = validateVoiceForm({
      source_content_id: sourceContentId,
      text: voiceForm.text,
    });
    setVoiceErrors(validated);

    if (hasFlow2Errors(validated)) {
      const first = firstFlow2Error(validated);
      if (first) focusElementById(voiceFieldIds[first]);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before generating voice.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    if (!generatedLetter) {
      setError({
        message: "Generate a love letter before creating voice.",
        code: "VALIDATION_ERROR",
        retryable: false,
      });
      setStep("letter-input");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow2-voice");
    await runAction(
      async () => {
        const generated = (await callApi("/api/flow-2/voice", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            source_content_id: generatedLetter.letter_content_id,
            partner_profile_id: selectedProfileId,
            text: voiceForm.text,
            voice_id: voiceForm.voice_id || undefined,
            style: voiceForm.style || undefined,
          }),
        })) as VoiceResponse;

        setVoiceAsset(generated);
        await refreshFlowState();
        setStep("result");
      },
      "Generating strict voice asset...",
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

  function handleLetterFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleGenerateLetter();
  }

  function handleVoiceFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleGenerateVoice();
  }

  return (
    <FlowShell moduleId="flow2">
      <FlowHeader
        eyebrow="Flow 2"
        title="Love Letter + Voice"
        subtitle="Strict provider mode: love-letter and voice both require provider success."
        signedInEmail={user?.email ?? null}
        steps={[
          { label: "1. Auth", active: step === "auth" },
          { label: "2. Partner", active: step === "partner" },
          { label: "3. Letter Input", active: step === "letter-input" },
          { label: "4. Letter Result", active: step === "letter-result" },
          { label: "5. Voice", active: step === "voice" },
          { label: "6. Result", active: step === "result" },
        ]}
        currentStepLabel={currentStepLabel}
      />

      <FlowErrorAlert
        error={error}
        loading={loading}
        panelRef={errorPanelRef}
        testId="flow2-error-panel"
        retryTestId="flow2-error-retry"
        onDismiss={() => setError(null)}
        onRetry={
          error?.retryable && retryAction
            ? () => void runAction(retryAction, "Retrying failed action...")
            : undefined
        }
      />

      {step === "auth" && (
        <FlowSection data-testid="flow2-auth-panel">
          <h2>Authenticate</h2>
          <p>Create an account or login to start Flow 2.</p>
          <form className="grid-form" onSubmit={handleAuthFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.name}>
                Name
              </label>
              <input
                id={authFieldIds.name}
                data-testid="flow2-auth-name"
                value={authForm.name}
                onChange={(event) => {
                  clearAuthFieldError("name");
                  setAuthForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow2-auth-name-help",
                  "flow2-auth-name-error",
                  Boolean(authErrors.name),
                )}
              />
              <p id="flow2-auth-name-help" className="flow-help">
                Required for registration.
              </p>
              {authErrors.name && (
                <p id="flow2-auth-name-error" className="flow-field-error">
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
                data-testid="flow2-auth-email"
                type="email"
                value={authForm.email}
                onChange={(event) => {
                  clearAuthFieldError("email");
                  setAuthForm((current) => ({ ...current, email: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.email)}
                aria-describedby={buildDescribedBy(
                  "flow2-auth-email-help",
                  "flow2-auth-email-error",
                  Boolean(authErrors.email),
                )}
              />
              <p id="flow2-auth-email-help" className="flow-help">
                Use a valid email address.
              </p>
              {authErrors.email && (
                <p id="flow2-auth-email-error" className="flow-field-error">
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
                data-testid="flow2-auth-password"
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
                  "flow2-auth-password-help",
                  "flow2-auth-password-error",
                  Boolean(authErrors.password),
                )}
              />
              <p id="flow2-auth-password-help" className="flow-help">
                Use at least 8 characters.
              </p>
              {authErrors.password && (
                <p id="flow2-auth-password-error" className="flow-field-error">
                  {authErrors.password}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button
                data-testid="flow2-auth-register"
                data-auth-mode="register"
                type="submit"
                disabled={loading}
              >
                Register
              </button>
              <button
                data-testid="flow2-auth-login"
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
        <FlowSection data-testid="flow2-partner-panel">
          <h2>Partner Profile (Mandatory)</h2>
          <p>Select an existing partner profile or create a new one.</p>

          {profiles.length > 0 ? (
            <fieldset className="flow-fieldset" data-testid="flow2-profile-list">
              <legend className="flow-legend">Choose partner profile</legend>
              <div className="flow-list">
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className="flow-list-item"
                    data-testid={`flow2-profile-option-${profile.id}`}
                    htmlFor={`flow2-profile-radio-${profile.id}`}
                  >
                    <input
                      id={`flow2-profile-radio-${profile.id}`}
                      data-testid={`flow2-profile-radio-${profile.id}`}
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
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={partnerFieldIds.name}>
                Partner name
              </label>
              <input
                id={partnerFieldIds.name}
                data-testid="flow2-profile-name"
                value={profileForm.name}
                onChange={(event) => {
                  clearPartnerFieldError("name");
                  setProfileForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(partnerErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow2-profile-name-help",
                  "flow2-profile-name-error",
                  Boolean(partnerErrors.name),
                )}
              />
              <p id="flow2-profile-name-help" className="flow-help">
                Required.
              </p>
              {partnerErrors.name && (
                <p id="flow2-profile-name-error" className="flow-field-error">
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
                data-testid="flow2-profile-interests"
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
                  "flow2-profile-interests-help",
                  "flow2-profile-interests-error",
                  Boolean(partnerErrors.interests),
                )}
              />
              <p id="flow2-profile-interests-help" className="flow-help">
                Example: music,dinner,travel
              </p>
              {partnerErrors.interests && (
                <p id="flow2-profile-interests-error" className="flow-field-error">
                  {partnerErrors.interests}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow2-profile-dislikes-input">
                Dislikes
              </label>
              <input
                id="flow2-profile-dislikes-input"
                data-testid="flow2-profile-dislikes"
                value={profileForm.dislikes}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    dislikes: event.target.value,
                  }))
                }
              />
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow2-profile-notes-input">
                Notes
              </label>
              <textarea
                id="flow2-profile-notes-input"
                data-testid="flow2-profile-notes"
                rows={2}
                value={profileForm.notes}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>

            <FlowActionRow>
              <button data-testid="flow2-profile-create" type="submit" disabled={loading}>
                Create Profile
              </button>
              <button
                data-testid="flow2-profile-continue"
                type="button"
                disabled={loading || !selectedProfileId}
                onClick={() => setStep("letter-input")}
              >
                Continue
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "letter-input" && (
        <FlowSection data-testid="flow2-letter-input-panel">
          <h2>Generate Strict Love Letter</h2>
          <p>Flow 2 requires successful provider-backed letter generation.</p>
          <form className="grid-form" onSubmit={handleLetterFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={letterFieldIds.tone}>
                Tone
              </label>
              <input
                id={letterFieldIds.tone}
                data-testid="flow2-letter-tone"
                value={letterForm.tone}
                onChange={(event) => {
                  clearLetterFieldError("tone");
                  setLetterForm((current) => ({ ...current, tone: event.target.value }));
                }}
                aria-invalid={Boolean(letterErrors.tone)}
                aria-describedby={buildDescribedBy(
                  "flow2-letter-tone-help",
                  "flow2-letter-tone-error",
                  Boolean(letterErrors.tone),
                )}
              />
              <p id="flow2-letter-tone-help" className="flow-help">
                Example: warm and romantic.
              </p>
              {letterErrors.tone && (
                <p id="flow2-letter-tone-error" className="flow-field-error">
                  {letterErrors.tone}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={letterFieldIds.length}>
                Length
              </label>
              <select
                id={letterFieldIds.length}
                data-testid="flow2-letter-length"
                value={letterForm.length}
                onChange={(event) => {
                  clearLetterFieldError("length");
                  setLetterForm((current) => ({
                    ...current,
                    length: event.target.value as "short" | "medium" | "long",
                  }));
                }}
                aria-invalid={Boolean(letterErrors.length)}
                aria-describedby={buildDescribedBy(
                  "flow2-letter-length-help",
                  "flow2-letter-length-error",
                  Boolean(letterErrors.length),
                )}
              >
                <option value="short">short</option>
                <option value="medium">medium</option>
                <option value="long">long</option>
              </select>
              <p id="flow2-letter-length-help" className="flow-help">
                Select message size.
              </p>
              {letterErrors.length && (
                <p id="flow2-letter-length-error" className="flow-field-error">
                  {letterErrors.length}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={letterFieldIds.memories}>
                Memories
              </label>
              <textarea
                id={letterFieldIds.memories}
                data-testid="flow2-letter-memories"
                rows={4}
                value={letterForm.memoriesText}
                onKeyDown={(event) => submitOnEnter(event, () => void handleGenerateLetter())}
                onChange={(event) => {
                  clearLetterFieldError("memories");
                  setLetterForm((current) => ({
                    ...current,
                    memoriesText: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(letterErrors.memories)}
                aria-describedby={buildDescribedBy(
                  "flow2-letter-memories-help",
                  "flow2-letter-memories-error",
                  Boolean(letterErrors.memories),
                )}
              />
              <p id="flow2-letter-memories-help" className="flow-help">
                Separate memories with semicolons or new lines.
              </p>
              {letterErrors.memories && (
                <p id="flow2-letter-memories-error" className="flow-field-error">
                  {letterErrors.memories}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button type="button" disabled={loading} onClick={() => setStep("partner")}>
                Back
              </button>
              <button data-testid="flow2-letter-submit" type="submit" disabled={loading}>
                Generate Letter
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "letter-result" && generatedLetter && (
        <FlowSection tone="result" data-testid="flow2-letter-result-panel">
          <h2 id="flow2-letter-result-heading">Letter Generated</h2>
          <p>Choose which text version should be spoken in voice generation.</p>

          <div className="flow-result-grid">
            <article className="flow-result-card" data-testid="flow2-letter-card">
              <h3>Love Letter</h3>
              <p>{generatedLetter.letter_text}</p>
            </article>
            <article className="flow-result-card" data-testid="flow2-sms-card">
              <h3>Short SMS</h3>
              <p>{generatedLetter.short_sms}</p>
            </article>
            <article className="flow-result-card" data-testid="flow2-captions-card">
              <h3>Captions</h3>
              <ul className="flow-ul">
                {generatedLetter.caption_versions.map((caption, index) => (
                  <li key={`caption-${index}`}>{caption}</li>
                ))}
              </ul>
            </article>
          </div>

          <fieldset className="flow-fieldset">
            <legend className="flow-legend" id={voiceFieldIds.source_content_id}>
              Voice source text
            </legend>
            <div className="flow-list">
              <label className="flow-list-item">
                <input
                  type="radio"
                  checked={selectedVoiceSource === "letter"}
                  onChange={() => handleSelectVoiceSource("letter")}
                />
                <span>Full letter</span>
              </label>
              <label className="flow-list-item">
                <input
                  type="radio"
                  checked={selectedVoiceSource === "sms"}
                  onChange={() => handleSelectVoiceSource("sms")}
                />
                <span>Short SMS</span>
              </label>
              {generatedLetter.caption_versions.map((_, index) => (
                <label key={`voice-caption-${index}`} className="flow-list-item">
                  <input
                    type="radio"
                    checked={selectedVoiceSource === `caption-${index}`}
                    onChange={() => handleSelectVoiceSource(`caption-${index}`)}
                  />
                  <span>{`Caption ${index + 1}`}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <FlowActionRow>
            <button type="button" disabled={loading} onClick={() => setStep("letter-input")}>
              Edit Letter Inputs
            </button>
            <button
              data-testid="flow2-to-voice"
              type="button"
              disabled={loading}
              onClick={() => setStep("voice")}
            >
              Continue to Voice
            </button>
          </FlowActionRow>
        </FlowSection>
      )}

      {step === "voice" && generatedLetter && (
        <FlowSection data-testid="flow2-voice-panel">
          <h2>Generate Strict Voice Asset</h2>
          <p>Voice generation must succeed through provider-backed synthesis and upload.</p>

          <form className="grid-form" onSubmit={handleVoiceFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={voiceFieldIds.text}>
                Voice text
              </label>
              <textarea
                id={voiceFieldIds.text}
                data-testid="flow2-voice-text"
                rows={4}
                value={voiceForm.text}
                onKeyDown={(event) => submitOnEnter(event, () => void handleGenerateVoice())}
                onChange={(event) => {
                  clearVoiceFieldError("text");
                  setVoiceForm((current) => ({ ...current, text: event.target.value }));
                }}
                aria-invalid={Boolean(voiceErrors.text)}
                aria-describedby={buildDescribedBy(
                  "flow2-voice-text-help",
                  "flow2-voice-text-error",
                  Boolean(voiceErrors.text),
                )}
              />
              <p id="flow2-voice-text-help" className="flow-help">
                Auto-filled from selected letter variant. You can edit if needed.
              </p>
              {voiceErrors.text && (
                <p id="flow2-voice-text-error" className="flow-field-error">
                  {voiceErrors.text}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow2-voice-id-input">
                Voice ID (optional)
              </label>
              <input
                id="flow2-voice-id-input"
                data-testid="flow2-voice-id"
                value={voiceForm.voice_id}
                onChange={(event) =>
                  setVoiceForm((current) => ({ ...current, voice_id: event.target.value }))
                }
              />
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow2-voice-style-input">
                Style (optional)
              </label>
              <input
                id="flow2-voice-style-input"
                data-testid="flow2-voice-style"
                value={voiceForm.style}
                onChange={(event) =>
                  setVoiceForm((current) => ({ ...current, style: event.target.value }))
                }
              />
            </div>

            <FlowActionRow>
              <button type="button" disabled={loading} onClick={() => setStep("letter-result")}>
                Back
              </button>
              <button data-testid="flow2-voice-submit" type="submit" disabled={loading}>
                Generate Voice
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "result" && voiceAsset && generatedLetter && (
        <FlowSection tone="result" data-testid="flow2-result-panel">
          <h2 ref={resultHeadingRef} tabIndex={-1}>
            Flow 2 Completed
          </h2>
          <FlowStatus successMessage="Letter and voice were both saved successfully." />

          <div className="flow-kpi-grid">
            <article className="flow-kpi">
              <strong>{generatedLetter.letter_content_id}</strong>
              <span>Letter content ID</span>
            </article>
            <article className="flow-kpi">
              <strong>{voiceAsset.audio_asset_id}</strong>
              <span>Voice asset ID</span>
            </article>
          </div>

          <article className="flow-voice-preview" data-testid="flow2-voice-preview">
            <h3>Playable Voice</h3>
            <audio controls src={voiceAsset.audio_url}>
              <track kind="captions" />
            </audio>
          </article>

          <h3>Recent Letters</h3>
          {historyLetters.length === 0 ? (
            <p className="flow-empty">No saved letters yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow2-history-letters">
              {historyLetters.map((item) => (
                <li key={item.id}>{item.content.slice(0, 120)}</li>
              ))}
            </ul>
          )}

          <h3>Recent Voice Assets</h3>
          {historyVoiceAssets.length === 0 ? (
            <p className="flow-empty">No saved voice assets yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow2-history-voices">
              {historyVoiceAssets.map((item) => (
                <li key={item.id}>
                  <a href={item.audioUrl} target="_blank" rel="noreferrer">
                    {item.id}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <FlowActionRow sticky>
            <button type="button" disabled={loading} onClick={() => setStep("letter-input")}>
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
        <Link href="/flow-1">Flow 1</Link>
      </footer>
    </FlowShell>
  );
}
