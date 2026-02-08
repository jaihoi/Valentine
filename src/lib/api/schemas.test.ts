import { describe, expect, it } from "vitest";
import {
  cardGenerateRequestSchema,
  datePlanRequestSchema,
  flow2LoveLetterRequestSchema,
  flow2VoiceRequestSchema,
  flow3CardGenerateRequestSchema,
  flow3CardStatusResponseSchema,
  flow4SessionStartRequestSchema,
  flow4SessionStatusResponseSchema,
  flow5GiftRequestSchema,
  flow5GiftResponseSchema,
  giftRequestSchema,
  loveLetterRequestSchema,
  vapiStartRequestSchema,
  voiceRequestSchema,
} from "@/lib/api/schemas";

describe("API contract schemas", () => {
  it("validates date plan request contract", () => {
    const parsed = datePlanRequestSchema.safeParse({
      city: "Los Angeles",
      budget: 200,
      vibe: "luxury",
      dietary: "none",
      date_time: "2026-02-14T20:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed gifts request", () => {
    const parsed = giftRequestSchema.safeParse({
      interests: [],
      budget: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts love letter contract", () => {
    const parsed = loveLetterRequestSchema.safeParse({
      tone: "heartfelt",
      length: "short",
      memories: ["first date"],
      partner_name: "Mia",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts voice contract", () => {
    const parsed = voiceRequestSchema.safeParse({
      text: "I adore you.",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts card generation contract", () => {
    const parsed = cardGenerateRequestSchema.safeParse({
      asset_ids: ["cm0p4kqsf0000a0i7sd8udxv9"],
      template_id: "classic",
      message_text: "Happy Valentine's Day",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts vapi session start contract", () => {
    const parsed = vapiStartRequestSchema.safeParse({
      user_id: "cm0p4kqsf0000a0i7sd8udxv9",
      scenario: "Plan a surprise call",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts flow2 love-letter contract", () => {
    const parsed = flow2LoveLetterRequestSchema.safeParse({
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      tone: "romantic",
      length: "medium",
      memories: ["first coffee date", "sunset walk"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed flow2 voice contract", () => {
    const parsed = flow2VoiceRequestSchema.safeParse({
      source_content_id: "bad-id",
      text: "",
      partner_profile_id: "bad-id",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts flow3 card generate contract", () => {
    const parsed = flow3CardGenerateRequestSchema.safeParse({
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      asset_ids: ["cm0p4kqsf0001a0i7sd8udxv0"],
      template_id: "classic-rose",
      message_text: "Forever my favorite person.",
      music_option: "piano-soft",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed flow3 card status contract", () => {
    const parsed = flow3CardStatusResponseSchema.safeParse({
      card_id: "bad-id",
      status: "UNKNOWN",
      preview_url: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts flow4 session start contract", () => {
    const parsed = flow4SessionStartRequestSchema.safeParse({
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      scenario: "Help me host a sweet surprise evening call.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed flow4 session status contract", () => {
    const parsed = flow4SessionStatusResponseSchema.safeParse({
      session_id: "bad-id",
      call_link_or_number: "not-a-url",
      status: "UNKNOWN",
      updated_at: 1234,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts flow5 gift recommend request contract", () => {
    const parsed = flow5GiftRequestSchema.safeParse({
      partner_profile_id: "cm0p4kqsf0000a0i7sd8udxv9",
      interests: ["music", "coffee"],
      budget: 120,
      constraints: "no jewelry",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed flow5 gift response contract", () => {
    const parsed = flow5GiftResponseSchema.safeParse({
      gift_recommendation_id: "bad-id",
      recommendations: [],
      explanation: 42,
      links: ["not-a-url"],
      sources: {
        perplexity_links: [],
        firecrawl_extracts_count: -1,
      },
    });
    expect(parsed.success).toBe(false);
  });
});
