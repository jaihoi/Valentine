import {
  datePlanResponseSchema,
  giftResponseSchema,
  loveLetterResponseSchema,
  type DatePlanRequest,
  type GiftRequest,
  type GiftResponse,
  type LoveLetterRequest,
  type LoveLetterResponse,
} from "@/lib/api/schemas";
import {
  buildDatePlanPrompts,
  buildGiftPrompts,
  buildLoveLetterPrompts,
} from "@/lib/ai/prompts";
import { rankRecommendations } from "@/lib/ai/ranking";
import { FlowError } from "@/lib/flow-errors";
import { withGlobalTimeout } from "@/lib/network";
import { enrichLinks, enrichLinksStrict } from "@/lib/providers/firecrawl";
import {
  generateStructuredJson,
  generateStructuredJsonStrict,
} from "@/lib/providers/openai";
import {
  searchWebContext,
  searchWebContextStrict,
} from "@/lib/providers/perplexity";

type DatePlanPayload = {
  itinerary: Array<{ time: string; activity: string; details: string }>;
  venue_options: Array<{ name: string; reason: string; link?: string }>;
  estimated_cost: number;
  rationale: string;
};

export type StrictDatePlanResult = {
  plan: DatePlanPayload;
  sources: {
    perplexity_links: string[];
    firecrawl_extracts_count: number;
  };
  providerMeta: {
    fastRouterModel: string;
    perplexityLinksUsed: number;
    firecrawlExtractsCount: number;
  };
};

export type StrictGiftResult = {
  gift: GiftResponse;
  sources: {
    perplexity_links: string[];
    firecrawl_extracts_count: number;
  };
  providerMeta: {
    fastRouterModel: string;
    perplexityLinksUsed: number;
    firecrawlExtractsCount: number;
  };
};

const strictDatePlanSchema = datePlanResponseSchema.omit({ plan_id: true });
const strictLoveLetterSchema = loveLetterResponseSchema;
const strictGiftSchema = giftResponseSchema;

function isStrictDatePlanPayload(value: unknown): value is DatePlanPayload {
  return strictDatePlanSchema.safeParse(value).success;
}

function isStrictLoveLetterPayload(value: unknown): value is LoveLetterResponse {
  return strictLoveLetterSchema.safeParse(value).success;
}

function isStrictGiftPayload(value: unknown): value is GiftResponse {
  return strictGiftSchema.safeParse(value).success;
}

export async function generateDatePlanStrict(
  input: DatePlanRequest,
): Promise<StrictDatePlanResult> {
  return withGlobalTimeout(
    async () => {
      const prompts = buildDatePlanPrompts(input);

      const webContext = await searchWebContextStrict(
        `Top romantic date venues in ${input.city} for ${input.vibe} vibe within ${input.budget} USD`,
        { timeoutMs: 4_000, retries: 0 },
      );

      const firecrawlPromise = enrichLinksStrict(webContext.links, {
        timeoutMs: 4_000,
        retries: 0,
      });

      const generationPromise = generateStructuredJsonStrict<DatePlanPayload>(
        prompts.system,
        `${prompts.user}

Web summary:
${webContext.summary}
Links:
${webContext.links.join("\n")}
`,
        isStrictDatePlanPayload,
        { timeoutMs: 6_000, retries: 0 },
      );

      const [extracts, generated] = await Promise.all([
        firecrawlPromise,
        generationPromise,
      ]);

      return {
        plan: generated,
        sources: {
          perplexity_links: webContext.links,
          firecrawl_extracts_count: extracts.length,
        },
        providerMeta: {
          fastRouterModel: "fastrouter",
          perplexityLinksUsed: webContext.links.length,
          firecrawlExtractsCount: extracts.length,
        },
      };
    },
    8_000,
    new FlowError("Flow 1 orchestration exceeded timeout budget", {
      code: "PROVIDER_TIMEOUT",
      status: 504,
      retryable: true,
      provider: "orchestrator",
    }),
  );
}

export async function generateLoveLetterStrict(
  input: LoveLetterRequest,
): Promise<LoveLetterResponse> {
  const prompts = buildLoveLetterPrompts(input);

  return generateStructuredJsonStrict<LoveLetterResponse>(
    prompts.system,
    prompts.user,
    isStrictLoveLetterPayload,
    { timeoutMs: 6_000, retries: 0 },
  );
}

export async function generateGiftRecommendationsStrict(
  input: GiftRequest,
): Promise<StrictGiftResult> {
  return withGlobalTimeout(
    async () => {
      const prompts = buildGiftPrompts(input);

      const webContext = await searchWebContextStrict(
        `Best gift ideas for interests: ${input.interests.join(", ")} under ${
          input.budget
        } USD with constraints: ${input.constraints ?? "none"}`,
        { timeoutMs: 4_000, retries: 0 },
      );

      const firecrawlPromise = enrichLinksStrict(webContext.links, {
        timeoutMs: 4_000,
        retries: 0,
      });

      const generationPromise = generateStructuredJsonStrict<GiftResponse>(
        prompts.system,
        `${prompts.user}

Web summary:
${webContext.summary}
Links:
${webContext.links.join("\n")}
`,
        isStrictGiftPayload,
        { timeoutMs: 6_000, retries: 0 },
      );

      const [extracts, generated] = await Promise.all([
        firecrawlPromise,
        generationPromise,
      ]);

      const ranked = rankRecommendations(generated.recommendations, {
        budget: input.budget,
        interests: input.interests,
      });

      return {
        gift: {
          recommendations: ranked.slice(0, 5),
          explanation: generated.explanation,
          links: generated.links.length > 0 ? generated.links : webContext.links,
        },
        sources: {
          perplexity_links: webContext.links,
          firecrawl_extracts_count: extracts.length,
        },
        providerMeta: {
          fastRouterModel: "fastrouter",
          perplexityLinksUsed: webContext.links.length,
          firecrawlExtractsCount: extracts.length,
        },
      };
    },
    8_000,
    new FlowError("Flow 5 orchestration exceeded timeout budget", {
      code: "PROVIDER_TIMEOUT",
      status: 504,
      retryable: true,
      provider: "orchestrator",
    }),
  );
}

export async function generateDatePlan(input: DatePlanRequest) {
  const fallback = {
    itinerary: [
      {
        time: "6:30 PM",
        activity: "Sunset walk",
        details: `Start with a walk at a scenic spot in ${input.city}.`,
      },
      {
        time: "7:30 PM",
        activity: "Dinner",
        details: "Book a cozy dinner aligned with your vibe preferences.",
      },
      {
        time: "9:00 PM",
        activity: "Dessert and notes",
        details: "Share one appreciation note each.",
      },
    ],
    venue_options: [
      {
        name: `${input.vibe} dinner pick`,
        reason: "Matches requested atmosphere and budget.",
      },
    ],
    estimated_cost: input.budget,
    rationale:
      "Fallback itinerary generated locally because external AI providers were unavailable.",
  };

  const prompts = buildDatePlanPrompts(input);
  const webContext = await searchWebContext(
    `Top romantic date venues in ${input.city} for ${input.vibe} vibe within ${input.budget} USD`,
  );
  const linkSummaries = await enrichLinks(webContext.links);

  const extraContext = `
Web summary:
${webContext.summary || "none"}
Links:
${webContext.links.join("\n") || "none"}
Link extracts:
${linkSummaries.join("\n") || "none"}
`;

  const generated = await generateStructuredJson(
    prompts.system,
    `${prompts.user}\n\n${extraContext}`,
    fallback,
  );

  const parsed = datePlanResponseSchema
    .omit({ plan_id: true })
    .safeParse(generated);

  return parsed.success ? parsed.data : fallback;
}

export async function generateGiftRecommendations(input: GiftRequest) {
  const fallback = {
    recommendations: [
      {
        title: "Personalized photo book",
        reason: "A meaningful keepsake built from shared memories.",
        estimated_price: Math.min(input.budget, 55),
      },
      {
        title: "Planned surprise date kit",
        reason: "Turns shared interests into an experience gift.",
        estimated_price: Math.min(input.budget, 80),
      },
    ],
    explanation:
      "Fallback recommendations generated locally because external providers were unavailable.",
    links: [],
  };

  const prompts = buildGiftPrompts(input);
  const webContext = await searchWebContext(
    `Best gift ideas for interests: ${input.interests.join(", ")} under ${
      input.budget
    } USD`,
  );
  const generated = await generateStructuredJson(
    prompts.system,
    `${prompts.user}\n\nWeb summary: ${webContext.summary}`,
    fallback,
  );

  const parsed = giftResponseSchema.safeParse(generated);
  const valid = parsed.success ? parsed.data : fallback;
  const ranked = rankRecommendations(valid.recommendations, {
    budget: input.budget,
    interests: input.interests,
  });

  return {
    recommendations: ranked.slice(0, 5),
    explanation: valid.explanation,
    links: valid.links.length > 0 ? valid.links : webContext.links,
  };
}

export async function generateLoveLetter(input: LoveLetterRequest) {
  const fallback = {
    letter_text: `Dear ${input.partner_name}, every moment with you feels like home. Thank you for every laugh, every lesson, and every day we grow together.`,
    short_sms: `Happy Valentine's Day, ${input.partner_name}. You are my favorite part of every day.`,
    caption_versions: [
      `With you, every day feels special. Happy Valentine's Day.`,
      `Still crushing on you, always.`,
    ],
  };

  const prompts = buildLoveLetterPrompts(input);
  const generated = await generateStructuredJson(
    prompts.system,
    prompts.user,
    fallback,
  );
  const parsed = loveLetterResponseSchema.safeParse(generated);
  return parsed.success ? parsed.data : fallback;
}
