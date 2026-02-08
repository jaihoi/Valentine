import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/network";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";
import { safeJsonParse } from "@/lib/utils";

type PerplexityResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
};

type WebContext = {
  summary: string;
  links: string[];
};

type StrictOptions = {
  timeoutMs?: number;
  retries?: number;
};

export async function searchWebContextStrict(
  query: string,
  options: StrictOptions = {},
): Promise<WebContext> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const retries = options.retries ?? 0;

  if (!env.PERPLEXITY_API_KEY) {
    throw new FlowError("Perplexity API key is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "perplexity",
    });
  }

  try {
    const response = await withCircuitBreaker("perplexity-search", () =>
      withRetry(
        () =>
          fetchWithTimeout(
            "https://api.perplexity.ai/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "sonar",
                messages: [
                  {
                    role: "system",
                    content:
                      "Return a concise answer in JSON with fields `summary` and `links` (array).",
                  },
                  {
                    role: "user",
                    content: query,
                  },
                ],
                temperature: 0.2,
              }),
            },
            timeoutMs,
          ),
        { retries },
      ),
    );

    if (!response.ok) {
      throw new FlowError(
        `Perplexity request failed with status ${response.status}`,
        {
          code: "PROVIDER_ENRICHMENT_FAILED",
          status: 502,
          retryable: true,
          provider: "perplexity",
        },
      );
    }

    const json = (await response.json()) as PerplexityResponse;
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse<{ summary?: string; links?: string[] }>(raw, {});
    const links = (parsed.links ?? json.citations ?? []).filter((link) => {
      try {
        // Keep only valid URLs for downstream Firecrawl enrichment.
        new URL(link);
        return true;
      } catch {
        return false;
      }
    });

    if (links.length === 0 || !parsed.summary?.trim()) {
      throw new FlowError("Perplexity returned insufficient enrichment context", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "perplexity",
      });
    }

    return {
      summary: parsed.summary,
      links,
    };
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new FlowError(error.message, {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "perplexity",
      });
    }

    if (error instanceof FlowError) {
      throw error;
    }

    throw new FlowError("Perplexity enrichment failed", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "perplexity",
      details: String(error),
    });
  }
}

export async function searchWebContext(query: string): Promise<WebContext> {
  if (!env.PERPLEXITY_API_KEY) {
    return { summary: "", links: [] };
  }

  try {
    const response = await withCircuitBreaker("perplexity-search", () =>
      withRetry(() =>
        fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "system",
                content:
                  "Return a concise answer in JSON with fields `summary` and `links` (array).",
              },
              {
                role: "user",
                content: query,
              },
            ],
            temperature: 0.2,
          }),
        }),
      ),
    );

    if (!response.ok) {
      return { summary: "", links: [] };
    }

    const json = (await response.json()) as PerplexityResponse;
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = safeJsonParse<{ summary?: string; links?: string[] }>(raw, {});
    return {
      summary: parsed.summary ?? "",
      links: parsed.links ?? json.citations ?? [],
    };
  } catch {
    return { summary: "", links: [] };
  }
}
