import crypto from "node:crypto";
import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/network";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";

type VapiStartPayload = {
  userId: string;
  scenario: string;
  partnerName?: string;
};

type StrictOptions = {
  timeoutMs?: number;
  retries?: number;
};

type VapiStartResult = {
  providerSessionId: string;
  callLinkOrNumber: string;
  providerMeta: Record<string, unknown>;
};

type VapiResponse = {
  id?: string;
  webCallUrl?: string;
  phoneNumber?: string;
};

function getVapiToken() {
  return env.VAPI_API_KEY ?? env.VAPI_WEBHOOK_SECRET;
}

function buildVapiRequestBody(payload: VapiStartPayload) {
  return {
    customer: {
      number: "",
    },
    assistantOverrides: {
      firstMessage:
        "Hi, I am your Valentine AI concierge. How can I make tonight special?",
      variableValues: {
        scenario: payload.scenario,
        partnerName: payload.partnerName ?? "your partner",
      },
    },
    metadata: {
      userId: payload.userId,
      scenario: payload.scenario,
    },
  };
}

function mapVapiResponseToStartResult(
  json: VapiResponse,
  fallbackPrefix = "unknown",
): VapiStartResult {
  return {
    providerSessionId: json.id ?? `${fallbackPrefix}_${Date.now()}`,
    callLinkOrNumber:
      json.webCallUrl ?? json.phoneNumber ?? `https://example.com/call/${Date.now()}`,
    providerMeta: json as Record<string, unknown>,
  };
}

export async function startVapiSession(payload: VapiStartPayload): Promise<{
  providerSessionId: string;
  callLinkOrNumber: string;
  providerMeta: Record<string, unknown>;
}> {
  const vapiToken = getVapiToken();

  if (!vapiToken) {
    return {
      providerSessionId: `mock_${Date.now()}`,
      callLinkOrNumber: `https://example.com/mock-call/${Date.now()}`,
      providerMeta: {
        mode: "mock",
      },
    };
  }

  try {
    const response = await withCircuitBreaker("vapi-start-call", () =>
      withRetry(() =>
        fetch("https://api.vapi.ai/call", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vapiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildVapiRequestBody(payload)),
        }),
      ),
    );

    if (!response.ok) {
      return {
        providerSessionId: `fallback_${Date.now()}`,
        callLinkOrNumber: `https://example.com/fallback-call/${Date.now()}`,
        providerMeta: { mode: "fallback", reason: "non-2xx response" },
      };
    }

    const json = (await response.json()) as VapiResponse;

    return mapVapiResponseToStartResult(json);
  } catch {
    return {
      providerSessionId: `fallback_${Date.now()}`,
      callLinkOrNumber: `https://example.com/fallback-call/${Date.now()}`,
      providerMeta: { mode: "fallback", reason: "request failure" },
    };
  }
}

export async function startVapiSessionStrict(
  payload: VapiStartPayload,
  options: StrictOptions = {},
): Promise<VapiStartResult> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const retries = options.retries ?? 0;
  const vapiToken = getVapiToken();

  if (!vapiToken) {
    throw new FlowError("Vapi API key is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "vapi",
    });
  }

  try {
    const response = await withCircuitBreaker("vapi-start-call-strict", () =>
      withRetry(
        () =>
          fetchWithTimeout(
            "https://api.vapi.ai/call",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${vapiToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(buildVapiRequestBody(payload)),
            },
            timeoutMs,
          ),
        { retries },
      ),
    );

    if (!response.ok) {
      throw new FlowError(
        `Vapi request failed with status ${response.status}`,
        {
          code: "PROVIDER_ENRICHMENT_FAILED",
          status: 502,
          retryable: true,
          provider: "vapi",
        },
      );
    }

    const json = (await response.json()) as VapiResponse;
    if (!json.id || !json.webCallUrl) {
      throw new FlowError("Vapi response is missing required session data", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "vapi",
      });
    }

    return mapVapiResponseToStartResult(json, "flow4");
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new FlowError(error.message, {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "vapi",
      });
    }
    if (error instanceof FlowError) {
      throw error;
    }
    throw new FlowError("Vapi session start failed", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "vapi",
      details: String(error),
    });
  }
}

export function verifyVapiWebhook(body: string, signature: string | null): boolean {
  if (!env.VAPI_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", env.VAPI_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
