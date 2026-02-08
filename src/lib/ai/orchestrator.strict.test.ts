import { describe, expect, it, vi } from "vitest";
import { FlowError } from "@/lib/flow-errors";
import {
  generateDatePlanStrict,
  generateGiftRecommendationsStrict,
  generateLoveLetterStrict,
} from "@/lib/ai/orchestrator";
import { enrichLinksStrict } from "@/lib/providers/firecrawl";
import { generateStructuredJsonStrict } from "@/lib/providers/openai";
import { searchWebContextStrict } from "@/lib/providers/perplexity";

vi.mock("@/lib/providers/perplexity", () => ({
  searchWebContextStrict: vi.fn(),
  searchWebContext: vi.fn(),
}));

vi.mock("@/lib/providers/firecrawl", () => ({
  enrichLinksStrict: vi.fn(),
  enrichLinks: vi.fn(),
}));

vi.mock("@/lib/providers/openai", () => ({
  generateStructuredJsonStrict: vi.fn(),
  generateStructuredJson: vi.fn(),
}));

const mockedSearchWebContextStrict = vi.mocked(searchWebContextStrict);
const mockedEnrichLinksStrict = vi.mocked(enrichLinksStrict);
const mockedGenerateStructuredJsonStrict = vi.mocked(generateStructuredJsonStrict);

describe("generateDatePlanStrict", () => {
  it("returns strict date plan payload and source metadata on success", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "romantic spots",
      links: ["https://example.com/a", "https://example.com/b"],
    });
    mockedEnrichLinksStrict.mockResolvedValue(["extract 1", "extract 2"]);
    mockedGenerateStructuredJsonStrict.mockResolvedValue({
      itinerary: [
        { time: "7:00 PM", activity: "Dinner", details: "Candlelight dinner" },
      ],
      venue_options: [
        { name: "Rooftop Garden", reason: "Scenic and intimate" },
      ],
      estimated_cost: 200,
      rationale: "Matches requested vibe and budget.",
    });

    const result = await generateDatePlanStrict({
      city: "Austin",
      budget: 200,
      vibe: "romantic",
      dietary: "none",
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      date_time: undefined,
    });

    expect(result.plan.estimated_cost).toBe(200);
    expect(result.sources.perplexity_links.length).toBe(2);
    expect(result.sources.firecrawl_extracts_count).toBe(2);
  });

  it("fails strict gate when firecrawl enrichment fails", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "romantic spots",
      links: ["https://example.com/a"],
    });
    mockedEnrichLinksStrict.mockRejectedValue(
      new FlowError("Firecrawl timed out", {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "firecrawl",
      }),
    );
    mockedGenerateStructuredJsonStrict.mockResolvedValue({
      itinerary: [
        { time: "7:00 PM", activity: "Dinner", details: "Candlelight dinner" },
      ],
      venue_options: [
        { name: "Rooftop Garden", reason: "Scenic and intimate" },
      ],
      estimated_cost: 200,
      rationale: "Matches requested vibe and budget.",
    });

    await expect(
      generateDatePlanStrict({
        city: "Austin",
        budget: 200,
        vibe: "romantic",
        dietary: "none",
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        date_time: undefined,
      }),
    ).rejects.toBeInstanceOf(FlowError);
  });

  it("fails strict gate when fastrouter generation fails", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "romantic spots",
      links: ["https://example.com/a"],
    });
    mockedEnrichLinksStrict.mockResolvedValue(["extract 1"]);
    mockedGenerateStructuredJsonStrict.mockRejectedValue(
      new FlowError("FastRouter failed", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "fastrouter",
      }),
    );

    await expect(
      generateDatePlanStrict({
        city: "Austin",
        budget: 200,
        vibe: "romantic",
        dietary: "none",
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
        date_time: undefined,
      }),
    ).rejects.toBeInstanceOf(FlowError);
  });
});

describe("generateLoveLetterStrict", () => {
  it("returns strict love letter payload on success", async () => {
    mockedGenerateStructuredJsonStrict.mockResolvedValue({
      letter_text: "You are my favorite person.",
      short_sms: "Happy Valentine's Day!",
      caption_versions: ["Always us", "My forever favorite"],
    });

    const result = await generateLoveLetterStrict({
      tone: "warm",
      length: "medium",
      memories: ["coffee date"],
      partner_name: "Ava",
    });

    expect(result.letter_text).toContain("favorite");
    expect(result.caption_versions.length).toBe(2);
  });

  it("throws provider config missing when strict generation provider is unavailable", async () => {
    mockedGenerateStructuredJsonStrict.mockRejectedValue(
      new FlowError("FastRouter API key is not configured", {
        code: "PROVIDER_CONFIG_MISSING",
        status: 503,
        retryable: false,
        provider: "fastrouter",
      }),
    );

    await expect(
      generateLoveLetterStrict({
        tone: "warm",
        length: "medium",
        memories: ["coffee date"],
        partner_name: "Ava",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_CONFIG_MISSING",
      provider: "fastrouter",
    });
  });

  it("throws provider timeout when strict generation times out", async () => {
    mockedGenerateStructuredJsonStrict.mockRejectedValue(
      new FlowError("Request timed out after 6000ms", {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "fastrouter",
      }),
    );

    await expect(
      generateLoveLetterStrict({
        tone: "romantic",
        length: "short",
        memories: ["first dance"],
        partner_name: "Mia",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      provider: "fastrouter",
    });
  });

  it("throws enrichment failed when malformed provider output is returned", async () => {
    mockedGenerateStructuredJsonStrict.mockRejectedValue(
      new FlowError("FastRouter response failed schema validation", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "fastrouter",
      }),
    );

    await expect(
      generateLoveLetterStrict({
        tone: "playful",
        length: "long",
        memories: ["road trip"],
        partner_name: "Noah",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "fastrouter",
    });
  });
});

describe("generateGiftRecommendationsStrict", () => {
  it("returns strict gift payload with source metadata on success", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "gift ideas from web",
      links: ["https://example.com/gifts-a", "https://example.com/gifts-b"],
    });
    mockedEnrichLinksStrict.mockResolvedValue(["extract a", "extract b"]);
    mockedGenerateStructuredJsonStrict.mockResolvedValue({
      recommendations: [
        {
          title: "Music Vinyl Set",
          reason: "Great for music lovers and date nights.",
          estimated_price: 70,
        },
        {
          title: "Dinner Experience Box",
          reason: "Creates a romantic dinner at home.",
          estimated_price: 95,
        },
      ],
      explanation: "Curated from interests and budget.",
      links: ["https://example.com/gifts-a"],
    });

    const result = await generateGiftRecommendationsStrict({
      interests: ["music", "dinner"],
      budget: 120,
      constraints: "no perfume",
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
    });

    expect(result.gift.recommendations.length).toBeGreaterThan(0);
    expect(result.sources.perplexity_links.length).toBe(2);
    expect(result.sources.firecrawl_extracts_count).toBe(2);
  });

  it("throws provider config missing when strict search key is absent", async () => {
    mockedSearchWebContextStrict.mockRejectedValue(
      new FlowError("Perplexity API key is not configured", {
        code: "PROVIDER_CONFIG_MISSING",
        status: 503,
        retryable: false,
        provider: "perplexity",
      }),
    );

    await expect(
      generateGiftRecommendationsStrict({
        interests: ["music"],
        budget: 80,
        constraints: undefined,
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_CONFIG_MISSING",
      provider: "perplexity",
    });
  });

  it("throws provider timeout when strict enrichment times out", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "gift ideas from web",
      links: ["https://example.com/gifts-a"],
    });
    mockedEnrichLinksStrict.mockRejectedValue(
      new FlowError("Request timed out after 4000ms", {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "firecrawl",
      }),
    );

    await expect(
      generateGiftRecommendationsStrict({
        interests: ["music"],
        budget: 80,
        constraints: undefined,
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      provider: "firecrawl",
    });
  });

  it("throws enrichment failed when strict generation output is malformed", async () => {
    mockedSearchWebContextStrict.mockResolvedValue({
      summary: "gift ideas from web",
      links: ["https://example.com/gifts-a"],
    });
    mockedEnrichLinksStrict.mockResolvedValue(["extract a"]);
    mockedGenerateStructuredJsonStrict.mockRejectedValue(
      new FlowError("FastRouter response failed schema validation", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "fastrouter",
      }),
    );

    await expect(
      generateGiftRecommendationsStrict({
        interests: ["music"],
        budget: 80,
        constraints: undefined,
        partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ENRICHMENT_FAILED",
      provider: "fastrouter",
    });
  });
});
