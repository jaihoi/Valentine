import OpenAI from "openai";
import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/network";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";
import { safeJsonParse } from "@/lib/utils";

const client = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

type FastRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type StrictOptions = {
  timeoutMs?: number;
  retries?: number;
};

export async function generateStructuredJsonStrict<T>(
  systemPrompt: string,
  userPrompt: string,
  schemaValidator: (value: unknown) => value is T,
  options: StrictOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const retries = options.retries ?? 0;

  if (!env.FASTROUTER_API_KEY) {
    throw new FlowError("FastRouter API key is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "fastrouter",
    });
  }

  try {
    const response = await withCircuitBreaker("fastrouter-generate", () =>
      withRetry(
        () =>
          fetchWithTimeout(
            env.FASTROUTER_API_URL,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.FASTROUTER_API_KEY}`,
              },
              body: JSON.stringify({
                model: env.FASTROUTER_MODEL,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                response_format: { type: "json_object" },
                stream: false,
                temperature: 0.7,
              }),
            },
            timeoutMs,
          ),
        { retries },
      ),
    );

    if (!response.ok) {
      throw new FlowError(
        `FastRouter request failed with status ${response.status}`,
        {
          code: "PROVIDER_ENRICHMENT_FAILED",
          status: 502,
          retryable: true,
          provider: "fastrouter",
        },
      );
    }

    const json = (await response.json()) as FastRouterResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new FlowError("FastRouter returned empty content", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "fastrouter",
      });
    }

    const parsed = safeJsonParse<unknown>(content, null);
    if (!schemaValidator(parsed)) {
      throw new FlowError("FastRouter response failed schema validation", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "fastrouter",
      });
    }

    return parsed;
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new FlowError(error.message, {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "fastrouter",
      });
    }
    if (error instanceof FlowError) {
      throw error;
    }
    throw new FlowError("FastRouter generation failed", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "fastrouter",
      details: String(error),
    });
  }
}

async function generateWithFastRouter(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  if (!env.FASTROUTER_API_KEY) {
    return null;
  }

  const response = await withCircuitBreaker("fastrouter-generate", () =>
    withRetry(() =>
      fetch(env.FASTROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.FASTROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.FASTROUTER_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          stream: false,
          temperature: 0.7,
        }),
      }),
    ),
  );

  if (!response.ok) {
    throw new Error(`FastRouter request failed with status ${response.status}`);
  }

  const json = (await response.json()) as FastRouterResponse;
  return json.choices?.[0]?.message?.content ?? null;
}

export async function generateStructuredJson<T>(
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  try {
    if (env.FASTROUTER_API_KEY) {
      const content = await generateWithFastRouter(systemPrompt, userPrompt);
      if (!content) return fallback;
      return safeJsonParse<T>(content, fallback);
    }
  } catch {
    return fallback;
  }

  if (!client) {
    return fallback;
  }

  try {
    const result = await withCircuitBreaker("openai-generate", () =>
      withRetry(() =>
        client.chat.completions.create({
          model: env.OPENAI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      ),
    );

    const content = result.choices[0]?.message?.content;
    if (!content) return fallback;
    return safeJsonParse<T>(content, fallback);
  } catch {
    return fallback;
  }
}
