import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/network";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";

type FirecrawlResponse = {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: Record<string, unknown>;
  };
};

type StrictOptions = {
  timeoutMs?: number;
  retries?: number;
};

export async function enrichLinksStrict(
  links: string[],
  options: StrictOptions = {},
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 4_000;
  const retries = options.retries ?? 0;

  if (!env.FIRECRAWL_API_KEY) {
    throw new FlowError("Firecrawl API key is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "firecrawl",
    });
  }

  if (links.length === 0) {
    throw new FlowError("No links available for Firecrawl enrichment", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "firecrawl",
    });
  }

  const summaries = await Promise.all(
    links.slice(0, 3).map(async (link) => {
      try {
        const response = await withCircuitBreaker("firecrawl-scrape", () =>
          withRetry(
            () =>
              fetchWithTimeout(
                "https://api.firecrawl.dev/v1/scrape",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    url: link,
                    formats: ["markdown"],
                  }),
                },
                timeoutMs,
              ),
            { retries },
          ),
        );

        if (!response.ok) {
          throw new FlowError(
            `Firecrawl request failed with status ${response.status}`,
            {
              code: "PROVIDER_ENRICHMENT_FAILED",
              status: 502,
              retryable: true,
              provider: "firecrawl",
            },
          );
        }

        const json = (await response.json()) as FirecrawlResponse;
        if (!json.success) {
          throw new FlowError("Firecrawl returned unsuccessful response", {
            code: "PROVIDER_ENRICHMENT_FAILED",
            status: 502,
            retryable: true,
            provider: "firecrawl",
          });
        }
        const markdown = json.data?.markdown ?? "";
        if (!markdown.trim()) {
          throw new FlowError("Firecrawl returned empty extract", {
            code: "PROVIDER_ENRICHMENT_FAILED",
            status: 502,
            retryable: true,
            provider: "firecrawl",
          });
        }

        return markdown.slice(0, 220);
      } catch (error) {
        if (error instanceof RequestTimeoutError) {
          throw new FlowError(error.message, {
            code: "PROVIDER_TIMEOUT",
            status: 504,
            retryable: true,
            provider: "firecrawl",
          });
        }
        if (error instanceof FlowError) {
          throw error;
        }
        throw new FlowError("Firecrawl enrichment failed", {
          code: "PROVIDER_ENRICHMENT_FAILED",
          status: 502,
          retryable: true,
          provider: "firecrawl",
          details: String(error),
        });
      }
    }),
  );

  const filtered = summaries.filter((item) => item.length > 0);
  if (filtered.length === 0) {
    throw new FlowError("Firecrawl returned no valid extracts", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "firecrawl",
    });
  }

  return filtered;
}

export async function enrichLinks(links: string[]): Promise<string[]> {
  if (!env.FIRECRAWL_API_KEY || links.length === 0) {
    return [];
  }

  const summaries = await Promise.all(
    links.slice(0, 3).map(async (link) => {
      try {
        const response = await withCircuitBreaker("firecrawl-scrape", () =>
          withRetry(() =>
            fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: link,
                formats: ["markdown"],
              }),
            }),
          ),
        );

        if (!response.ok) {
          return "";
        }

        const json = (await response.json()) as FirecrawlResponse;
        if (!json.success) return "";
        const markdown = json.data?.markdown ?? "";
        return markdown.slice(0, 220);
      } catch {
        return "";
      }
    }),
  );

  return summaries.filter((item) => item.length > 0);
}
