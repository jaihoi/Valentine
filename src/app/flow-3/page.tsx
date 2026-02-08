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
  type CardFieldKey,
  type ManualAssetFieldKey,
  firstErrorKey as firstFlow3Error,
  hasFieldErrors as hasFlow3Errors,
  validateCardForm,
  validateManualAssetForm,
} from "@/lib/flow3/validation";

type Step = "auth" | "partner" | "media" | "card-input" | "processing" | "result";
type CardStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED";

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

type MemoryAsset = {
  id: string;
  cloudinaryId: string;
  secureUrl: string;
  resourceType: string;
  createdAt: string;
};

type CardHistoryItem = {
  id: string;
  partnerProfileId?: string | null;
  templateId: string;
  messageText: string;
  musicOption?: string | null;
  status: CardStatus;
  previewUrl: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

type Flow3HistoryResponse = {
  partner_profiles: PartnerProfile[];
  memory_assets: MemoryAsset[];
  cards: CardHistoryItem[];
};

type Flow3CardGenerateResponse = {
  card_id: string;
  status: CardStatus;
  preview_url: string | null;
};

type Flow3CardStatusResponse = {
  card_id: string;
  status: CardStatus;
  preview_url: string | null;
  error_message?: string | null;
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
  name: "flow3-auth-name-input",
  email: "flow3-auth-email-input",
  password: "flow3-auth-password-input",
};

const partnerFieldIds: Record<PartnerFieldKey, string> = {
  name: "flow3-profile-name-input",
  interests: "flow3-profile-interests-input",
};

const manualAssetFieldIds: Record<ManualAssetFieldKey, string> = {
  cloudinary_id: "flow3-manual-cloudinary-id-input",
  secure_url: "flow3-manual-secure-url-input",
  resource_type: "flow3-manual-resource-type-select",
};

const cardFieldIds: Record<CardFieldKey, string> = {
  asset_ids: "flow3-assets-list",
  template_id: "flow3-card-template-input",
  message_text: "flow3-card-message-input",
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

export default function FlowThreePage() {
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<PartnerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [assets, setAssets] = useState<MemoryAsset[]>([]);
  const [cards, setCards] = useState<CardHistoryItem[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [currentCardId, setCurrentCardId] = useState("");
  const [currentCardStatus, setCurrentCardStatus] =
    useState<Flow3CardStatusResponse | null>(null);

  const [error, setError] = useState<ErrorState | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);
  const [authErrors, setAuthErrors] = useState<Partial<Record<AuthFieldKey, string>>>(
    {},
  );
  const [partnerErrors, setPartnerErrors] = useState<
    Partial<Record<PartnerFieldKey, string>>
  >({});
  const [manualAssetErrors, setManualAssetErrors] = useState<
    Partial<Record<ManualAssetFieldKey, string>>
  >({});
  const [cardErrors, setCardErrors] = useState<Partial<Record<CardFieldKey, string>>>(
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
  const [manualAssetForm, setManualAssetForm] = useState({
    cloudinary_id: "",
    secure_url: "",
    resource_type: "image",
  });
  const [cardForm, setCardForm] = useState({
    template_id: "classic-rose",
    message_text: "Forever my favorite person.",
    music_option: "piano-soft",
  });
  const directUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const errorPanelRef = useRef<HTMLElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const currentStepLabel = useMemo(() => {
    switch (step) {
      case "auth":
        return "Auth";
      case "partner":
        return "Partner";
      case "media":
        return "Media";
      case "card-input":
        return "Card Input";
      case "processing":
        return "Processing";
      case "result":
        return "Result";
      default:
        return "Flow 3";
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
    if (step === "media") {
      focusElementById("flow3-media-heading");
      return;
    }
    if (step === "card-input") {
      focusElementById(cardFieldIds.template_id);
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

  function clearManualAssetFieldError(field: ManualAssetFieldKey) {
    setManualAssetErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearCardFieldError(field: CardFieldKey) {
    setCardErrors((current) => ({ ...current, [field]: undefined }));
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
    const flow = (await callApi("/api/history/flow-3", {
      method: "GET",
    })) as Flow3HistoryResponse;

    setProfiles(flow.partner_profiles);
    if (flow.partner_profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(flow.partner_profiles[0]!.id);
    }
    setAssets(flow.memory_assets);
    setCards(flow.cards);
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
      "Loading Flow 3...",
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

    const idempotencyKey = createIdempotencyKey("flow3-partner-profile");
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

  async function handleManualAssetRegister() {
    const validated = validateManualAssetForm(manualAssetForm);
    setManualAssetErrors(validated);
    if (hasFlow3Errors(validated)) {
      const first = firstFlow3Error(validated);
      if (first) focusElementById(manualAssetFieldIds[first]);
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow3-manual-asset");
    await runAction(
      async () => {
        const saved = (await callApi("/api/media/assets", {
          method: "POST",
          headers: {
            "x-flow-id": "flow3",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(manualAssetForm),
        })) as { asset: MemoryAsset };
        setSelectedAssetIds((current) =>
          current.includes(saved.asset.id) ? current : [...current, saved.asset.id],
        );
        setManualAssetForm({
          cloudinary_id: "",
          secure_url: "",
          resource_type: "image",
        });
        await refreshFlowState();
      },
      "Registering media asset...",
    );
  }

  async function handleDirectUpload() {
    const selectedFile = directUploadInputRef.current?.files?.[0];
    if (!selectedFile) {
      setError({
        message: "Choose a file before direct upload.",
        code: "VALIDATION_ERROR",
        retryable: false,
      });
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow3-direct-upload-asset");
    await runAction(
      async () => {
        const signed = (await callApi(
          "/api/media/upload-signature?subfolder=memory-assets",
          { method: "POST" },
        )) as {
          cloudinary_signature: string;
          timestamp: number;
          folder: string;
          cloud_name: string;
          api_key: string;
        };

        const resourceType = selectedFile.type.startsWith("video/")
          ? "video"
          : "image";
        const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloud_name}/${resourceType}/upload`;
        const uploadPayload = new FormData();
        uploadPayload.append("file", selectedFile);
        uploadPayload.append("api_key", signed.api_key);
        uploadPayload.append("timestamp", String(signed.timestamp));
        uploadPayload.append("signature", signed.cloudinary_signature);
        uploadPayload.append("folder", signed.folder);

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          body: uploadPayload,
        });
        const uploadText = await uploadResponse.text();
        const uploadJson = uploadText ? (JSON.parse(uploadText) as unknown) : null;
        if (!uploadResponse.ok) {
          throw {
            message: "Cloudinary upload failed",
            code: "PROVIDER_ENRICHMENT_FAILED",
            retryable: true,
            provider: "cloudinary",
            details: uploadJson,
          };
        }

        const uploaded = uploadJson as {
          public_id: string;
          secure_url: string;
          resource_type: string;
        };
        const saved = (await callApi("/api/media/assets", {
          method: "POST",
          headers: {
            "x-flow-id": "flow3",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            cloudinary_id: uploaded.public_id,
            secure_url: uploaded.secure_url,
            resource_type: uploaded.resource_type,
          }),
        })) as { asset: MemoryAsset };

        setSelectedAssetIds((current) =>
          current.includes(saved.asset.id) ? current : [...current, saved.asset.id],
        );
        if (directUploadInputRef.current) {
          directUploadInputRef.current.value = "";
        }
        await refreshFlowState();
      },
      "Uploading media directly...",
    );
  }

  function toggleAssetSelection(assetId: string) {
    clearCardFieldError("asset_ids");
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }

  async function pollCardStatus(cardId: string, attempt = 0): Promise<void> {
    stopPolling();
    setStatusMessage("Checking card processing status...");

    try {
      const status = (await callApi(`/api/flow-3/cards/${cardId}`, {
        method: "GET",
      })) as Flow3CardStatusResponse;
      setCurrentCardStatus(status);

      if (status.status === "READY" || status.status === "FAILED") {
        await refreshFlowState();
        setStep("result");
        setStatusMessage(
          status.status === "READY" ? "Card is ready." : "Card generation failed.",
        );
        return;
      }

      if (attempt >= 20) {
        setError({
          message: "Card is still processing. Retry status check.",
          code: "PROVIDER_TIMEOUT",
          retryable: true,
          provider: "queue",
        });
        setRetryAction(() => () => pollCardStatus(cardId, 0));
        return;
      }

      pollingTimerRef.current = window.setTimeout(() => {
        void pollCardStatus(cardId, attempt + 1);
      }, 1500);
    } catch (rawError) {
      const e = rawError as {
        message?: string;
        code?: string;
        retryable?: boolean;
        provider?: string;
      };
      setError({
        message: e.message ?? "Unable to fetch card status",
        code: e.code,
        retryable: e.retryable ?? true,
        provider: e.provider,
      });
      setRetryAction(() => () => pollCardStatus(cardId, attempt));
    }
  }

  async function handleCardGenerate() {
    const validated = validateCardForm({
      asset_ids: selectedAssetIds,
      template_id: cardForm.template_id,
      message_text: cardForm.message_text,
    });
    setCardErrors(validated);

    if (hasFlow3Errors(validated)) {
      const first = firstFlow3Error(validated);
      if (first) focusElementById(cardFieldIds[first]);
      return;
    }

    if (!selectedProfileId) {
      setError({
        message: "Select or create a partner profile before generating a card.",
        code: "PARTNER_PROFILE_REQUIRED",
        retryable: false,
      });
      setStep("partner");
      return;
    }

    const idempotencyKey = createIdempotencyKey("flow3-card-generate");
    await runAction(
      async () => {
        const generated = (await callApi("/api/flow-3/cards/generate", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            partner_profile_id: selectedProfileId,
            asset_ids: selectedAssetIds,
            template_id: cardForm.template_id,
            message_text: cardForm.message_text,
            music_option: cardForm.music_option || undefined,
          }),
        })) as Flow3CardGenerateResponse;

        setCurrentCardId(generated.card_id);
        setCurrentCardStatus({
          card_id: generated.card_id,
          status: generated.status,
          preview_url: generated.preview_url,
          error_message: null,
        });
        setStep("processing");
        await pollCardStatus(generated.card_id, 0);
      },
      "Submitting card generation...",
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

  function handleManualAssetFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleManualAssetRegister();
  }

  function handleCardFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleCardGenerate();
  }

  return (
    <FlowShell moduleId="flow3">
      <FlowHeader
        eyebrow="Flow 3"
        title="Memory Card Studio"
        subtitle="Mandatory partner profile + direct/manual media add + card generation and status tracking."
        signedInEmail={user?.email ?? null}
        steps={[
          { label: "1. Auth", active: step === "auth" },
          { label: "2. Partner", active: step === "partner" },
          { label: "3. Media", active: step === "media" },
          { label: "4. Card Input", active: step === "card-input" },
          { label: "5. Processing", active: step === "processing" },
          { label: "6. Result", active: step === "result" },
        ]}
        currentStepLabel={currentStepLabel}
      />

      <FlowErrorAlert
        error={error}
        loading={loading}
        panelRef={errorPanelRef}
        testId="flow3-error-panel"
        retryTestId="flow3-error-retry"
        onDismiss={() => setError(null)}
        onRetry={
          error?.retryable && retryAction
            ? () => void runAction(retryAction, "Retrying failed action...")
            : undefined
        }
      />

      {step === "auth" && (
        <FlowSection data-testid="flow3-auth-panel">
          <h2>Authenticate</h2>
          <p>Create an account or login to start Flow 3.</p>
          <form className="grid-form" onSubmit={handleAuthFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={authFieldIds.name}>
                Name
              </label>
              <input
                id={authFieldIds.name}
                data-testid="flow3-auth-name"
                value={authForm.name}
                onChange={(event) => {
                  clearAuthFieldError("name");
                  setAuthForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow3-auth-name-help",
                  "flow3-auth-name-error",
                  Boolean(authErrors.name),
                )}
              />
              <p id="flow3-auth-name-help" className="flow-help">
                Required for registration.
              </p>
              {authErrors.name && (
                <p id="flow3-auth-name-error" className="flow-field-error">
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
                data-testid="flow3-auth-email"
                type="email"
                value={authForm.email}
                onChange={(event) => {
                  clearAuthFieldError("email");
                  setAuthForm((current) => ({ ...current, email: event.target.value }));
                }}
                aria-invalid={Boolean(authErrors.email)}
                aria-describedby={buildDescribedBy(
                  "flow3-auth-email-help",
                  "flow3-auth-email-error",
                  Boolean(authErrors.email),
                )}
              />
              <p id="flow3-auth-email-help" className="flow-help">
                Use a valid email address.
              </p>
              {authErrors.email && (
                <p id="flow3-auth-email-error" className="flow-field-error">
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
                data-testid="flow3-auth-password"
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
                  "flow3-auth-password-help",
                  "flow3-auth-password-error",
                  Boolean(authErrors.password),
                )}
              />
              <p id="flow3-auth-password-help" className="flow-help">
                Use at least 8 characters.
              </p>
              {authErrors.password && (
                <p id="flow3-auth-password-error" className="flow-field-error">
                  {authErrors.password}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button
                data-testid="flow3-auth-register"
                data-auth-mode="register"
                type="submit"
                disabled={loading}
              >
                Register
              </button>
              <button
                data-testid="flow3-auth-login"
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
        <FlowSection data-testid="flow3-partner-panel">
          <h2>Partner Profile (Mandatory)</h2>
          <p>Select an existing partner profile or create a new one.</p>

          {profiles.length > 0 ? (
            <fieldset className="flow-fieldset" data-testid="flow3-profile-list">
              <legend className="flow-legend">Choose partner profile</legend>
              <div className="flow-list">
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className="flow-list-item"
                    data-testid={`flow3-profile-option-${profile.id}`}
                    htmlFor={`flow3-profile-radio-${profile.id}`}
                  >
                    <input
                      id={`flow3-profile-radio-${profile.id}`}
                      data-testid={`flow3-profile-radio-${profile.id}`}
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
                data-testid="flow3-profile-name"
                value={profileForm.name}
                onChange={(event) => {
                  clearPartnerFieldError("name");
                  setProfileForm((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(partnerErrors.name)}
                aria-describedby={buildDescribedBy(
                  "flow3-profile-name-help",
                  "flow3-profile-name-error",
                  Boolean(partnerErrors.name),
                )}
              />
              <p id="flow3-profile-name-help" className="flow-help">
                Required.
              </p>
              {partnerErrors.name && (
                <p id="flow3-profile-name-error" className="flow-field-error">
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
                data-testid="flow3-profile-interests"
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
                  "flow3-profile-interests-help",
                  "flow3-profile-interests-error",
                  Boolean(partnerErrors.interests),
                )}
              />
              <p id="flow3-profile-interests-help" className="flow-help">
                Example: music,dinner,travel
              </p>
              {partnerErrors.interests && (
                <p id="flow3-profile-interests-error" className="flow-field-error">
                  {partnerErrors.interests}
                </p>
              )}
            </div>

            <FlowActionRow>
              <button data-testid="flow3-profile-create" type="submit" disabled={loading}>
                Create Profile
              </button>
              <button
                data-testid="flow3-profile-continue"
                type="button"
                disabled={loading || !selectedProfileId}
                onClick={() => setStep("media")}
              >
                Continue
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "media" && (
        <FlowSection tone="media" data-testid="flow3-media-panel">
          <h2 id="flow3-media-heading" tabIndex={-1}>
            Add Media Assets
          </h2>
          <p>Use direct signed upload or manual asset registration fallback.</p>
          <FlowStatus loading={loading} loadingMessage={loadingMessage} />

          <div className="flow-media-split">
            <div className="flow-media-primary">
              <h3>Direct Upload</h3>
              <p className="flow-note">
                Signed browser upload is the fastest path for image/video assets.
              </p>
              <div className="flow-form-field">
                <label className="flow-label" htmlFor="flow3-direct-file-input">
                  Direct upload file
                </label>
                <input
                  id="flow3-direct-file-input"
                  data-testid="flow3-direct-file"
                  ref={directUploadInputRef}
                  type="file"
                />
              </div>
              <FlowActionRow>
                <button
                  data-testid="flow3-direct-upload"
                  type="button"
                  disabled={loading}
                  onClick={() => void handleDirectUpload()}
                >
                  Upload Directly
                </button>
              </FlowActionRow>
            </div>

            <form
              className="grid-form compact flow-media-secondary"
              onSubmit={handleManualAssetFormSubmit}
              noValidate
            >
              <h3>Manual Registration</h3>
              <p className="flow-note">
                Fallback mode when you already have a Cloudinary asset reference.
              </p>
            <div className="flow-form-field">
              <label className="flow-label" htmlFor={manualAssetFieldIds.cloudinary_id}>
                Cloudinary public id
              </label>
              <input
                id={manualAssetFieldIds.cloudinary_id}
                data-testid="flow3-manual-cloudinary-id"
                value={manualAssetForm.cloudinary_id}
                onChange={(event) => {
                  clearManualAssetFieldError("cloudinary_id");
                  setManualAssetForm((current) => ({
                    ...current,
                    cloudinary_id: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(manualAssetErrors.cloudinary_id)}
                aria-describedby={buildDescribedBy(
                  "flow3-manual-cloudinary-id-help",
                  "flow3-manual-cloudinary-id-error",
                  Boolean(manualAssetErrors.cloudinary_id),
                )}
              />
              <p id="flow3-manual-cloudinary-id-help" className="flow-help">
                Example: valentine/user-.../memory-assets/asset-id
              </p>
              {manualAssetErrors.cloudinary_id && (
                <p id="flow3-manual-cloudinary-id-error" className="flow-field-error">
                  {manualAssetErrors.cloudinary_id}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={manualAssetFieldIds.secure_url}>
                Secure URL
              </label>
              <input
                id={manualAssetFieldIds.secure_url}
                data-testid="flow3-manual-secure-url"
                value={manualAssetForm.secure_url}
                onChange={(event) => {
                  clearManualAssetFieldError("secure_url");
                  setManualAssetForm((current) => ({
                    ...current,
                    secure_url: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(manualAssetErrors.secure_url)}
                aria-describedby={buildDescribedBy(
                  "flow3-manual-secure-url-help",
                  "flow3-manual-secure-url-error",
                  Boolean(manualAssetErrors.secure_url),
                )}
              />
              <p id="flow3-manual-secure-url-help" className="flow-help">
                Must be a valid https URL.
              </p>
              {manualAssetErrors.secure_url && (
                <p id="flow3-manual-secure-url-error" className="flow-field-error">
                  {manualAssetErrors.secure_url}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={manualAssetFieldIds.resource_type}>
                Resource type
              </label>
              <select
                id={manualAssetFieldIds.resource_type}
                data-testid="flow3-manual-resource-type"
                value={manualAssetForm.resource_type}
                onChange={(event) => {
                  clearManualAssetFieldError("resource_type");
                  setManualAssetForm((current) => ({
                    ...current,
                    resource_type: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(manualAssetErrors.resource_type)}
                aria-describedby={buildDescribedBy(
                  "flow3-manual-resource-type-help",
                  "flow3-manual-resource-type-error",
                  Boolean(manualAssetErrors.resource_type),
                )}
              >
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="raw">raw</option>
              </select>
              <p id="flow3-manual-resource-type-help" className="flow-help">
                Choose the registered Cloudinary resource type.
              </p>
              {manualAssetErrors.resource_type && (
                <p id="flow3-manual-resource-type-error" className="flow-field-error">
                  {manualAssetErrors.resource_type}
                </p>
              )}
            </div>

              <button data-testid="flow3-manual-register" type="submit" disabled={loading}>
                Register Asset
              </button>
            </form>
          </div>

          <h3>Saved assets</h3>
          {assets.length === 0 ? (
            <p className="flow-empty">No assets registered yet.</p>
          ) : (
            <fieldset className="flow-fieldset" data-testid="flow3-assets-list">
              <legend className="flow-legend">Select assets for the card</legend>
              <div className="flow-list">
                {assets.map((asset) => (
                  <label key={asset.id} className="flow-list-item">
                    <input
                      data-testid={`flow3-asset-checkbox-${asset.id}`}
                      type="checkbox"
                      checked={selectedAssetIds.includes(asset.id)}
                      onChange={() => toggleAssetSelection(asset.id)}
                    />
                    <span>{asset.cloudinaryId}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {cardErrors.asset_ids && <p className="flow-field-error">{cardErrors.asset_ids}</p>}
          <p data-testid="flow3-selected-assets-count">
            Selected assets: {selectedAssetIds.length}
          </p>

          <FlowActionRow>
            <button type="button" disabled={loading} onClick={() => setStep("partner")}>
              Back
            </button>
            <button
              data-testid="flow3-media-continue"
              type="button"
              disabled={loading || selectedAssetIds.length === 0}
              onClick={() => setStep("card-input")}
            >
              Continue
            </button>
          </FlowActionRow>
        </FlowSection>
      )}

      {step === "card-input" && (
        <FlowSection data-testid="flow3-card-panel">
          <h2>Card Generation Input</h2>
          <p>Configure template, message, and music then submit generation.</p>
          <form className="grid-form" onSubmit={handleCardFormSubmit} noValidate>
            <FlowStatus loading={loading} loadingMessage={loadingMessage} />

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={cardFieldIds.template_id}>
                Template id
              </label>
              <input
                id={cardFieldIds.template_id}
                data-testid="flow3-card-template"
                value={cardForm.template_id}
                onChange={(event) => {
                  clearCardFieldError("template_id");
                  setCardForm((current) => ({
                    ...current,
                    template_id: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(cardErrors.template_id)}
                aria-describedby={buildDescribedBy(
                  "flow3-card-template-help",
                  "flow3-card-template-error",
                  Boolean(cardErrors.template_id),
                )}
              />
              <p id="flow3-card-template-help" className="flow-help">
                Example: classic-rose
              </p>
              {cardErrors.template_id && (
                <p id="flow3-card-template-error" className="flow-field-error">
                  {cardErrors.template_id}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor={cardFieldIds.message_text}>
                Message text
              </label>
              <textarea
                id={cardFieldIds.message_text}
                data-testid="flow3-card-message"
                rows={3}
                value={cardForm.message_text}
                onChange={(event) => {
                  clearCardFieldError("message_text");
                  setCardForm((current) => ({
                    ...current,
                    message_text: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(cardErrors.message_text)}
                aria-describedby={buildDescribedBy(
                  "flow3-card-message-help",
                  "flow3-card-message-error",
                  Boolean(cardErrors.message_text),
                )}
              />
              <p id="flow3-card-message-help" className="flow-help">
                Up to 240 characters.
              </p>
              {cardErrors.message_text && (
                <p id="flow3-card-message-error" className="flow-field-error">
                  {cardErrors.message_text}
                </p>
              )}
            </div>

            <div className="flow-form-field">
              <label className="flow-label" htmlFor="flow3-card-music-input">
                Music option (optional)
              </label>
              <input
                id="flow3-card-music-input"
                data-testid="flow3-card-music"
                value={cardForm.music_option}
                onChange={(event) =>
                  setCardForm((current) => ({
                    ...current,
                    music_option: event.target.value,
                  }))
                }
              />
            </div>

            <p data-testid="flow3-selected-assets-count">
              Selected assets: {selectedAssetIds.length}
            </p>

            <FlowActionRow>
              <button type="button" disabled={loading} onClick={() => setStep("media")}>
                Back
              </button>
              <button data-testid="flow3-card-submit" type="submit" disabled={loading}>
                Generate Card
              </button>
            </FlowActionRow>
          </form>
        </FlowSection>
      )}

      {step === "processing" && (
        <FlowSection tone="processing" data-testid="flow3-processing-panel">
          <h2>Card Processing</h2>
          <FlowStatus successMessage={statusMessage || "Processing card..."} />
          {currentCardStatus && (
            <article className="flow-status-card">
              <p data-testid="flow3-processing-status">
                Card {currentCardStatus.card_id}: {currentCardStatus.status}
              </p>
            </article>
          )}
          <FlowActionRow>
            <button
              data-testid="flow3-processing-refresh"
              type="button"
              disabled={!currentCardId || loading}
              onClick={() => void pollCardStatus(currentCardId, 0)}
            >
              Refresh Status
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                stopPolling();
                setStep("card-input");
              }}
              >
                Back to Input
              </button>
          </FlowActionRow>
        </FlowSection>
      )}

      {step === "result" && currentCardStatus && (
        <FlowSection tone="result" data-testid="flow3-result-panel">
          <h2 ref={resultHeadingRef} tabIndex={-1}>
            Flow 3 Result
          </h2>
          <FlowStatus
            successMessage={
              currentCardStatus.status === "READY"
                ? "Card generated successfully."
                : "Card generation failed."
            }
          />
          <article className="flow-status-card">
            <p>Card ID: {currentCardStatus.card_id}</p>
            <p>
              Status:{" "}
              <span
                className={`flow-status-pill ${
                  currentCardStatus.status === "FAILED"
                    ? "failed"
                    : currentCardStatus.status === "READY"
                      ? "completed"
                      : "active"
                }`}
              >
                {currentCardStatus.status}
              </span>
            </p>
          </article>
          {currentCardStatus.error_message && (
            <p data-testid="flow3-result-error">{currentCardStatus.error_message}</p>
          )}
          {currentCardStatus.preview_url && (
            <a
              data-testid="flow3-result-preview"
              href={currentCardStatus.preview_url}
              target="_blank"
              rel="noreferrer"
            >
              Open Preview
            </a>
          )}

          <h3>Recent Cards</h3>
          {cards.length === 0 ? (
            <p className="flow-empty">No saved cards yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow3-history-cards">
              {cards.map((card) => (
                <li key={card.id} data-testid={`flow3-history-card-${card.id}`}>
                  <strong>{card.id}</strong> - {card.status}
                </li>
              ))}
            </ul>
          )}

          <h3>Recent Assets</h3>
          {assets.length === 0 ? (
            <p className="flow-empty">No saved assets yet.</p>
          ) : (
            <ul className="flow-ul" data-testid="flow3-history-assets">
              {assets.slice(0, 10).map((asset) => (
                <li key={asset.id}>{asset.cloudinaryId}</li>
              ))}
            </ul>
          )}

          <FlowActionRow sticky>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                stopPolling();
                setStep("media");
              }}
            >
              Create Another
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
        <Link href="/flow-2">Flow 2</Link>
      </footer>
    </FlowShell>
  );
}
