import { describe, expect, it } from "vitest";
import {
  buildDatePlanPrompts,
  buildGiftPrompts,
  buildLoveLetterPrompts,
} from "@/lib/ai/prompts";

describe("prompt builders", () => {
  it("builds date plan prompts with required context", () => {
    const prompts = buildDatePlanPrompts({
      city: "Chicago",
      budget: 180,
      vibe: "cozy",
      dietary: "vegetarian",
      date_time: "2026-02-14T19:00:00.000Z",
      partner_profile_id: undefined,
    });

    expect(prompts.system).toContain("strict JSON");
    expect(prompts.user).toContain("Chicago");
    expect(prompts.user).toContain("vegetarian");
  });

  it("builds gift prompts with interest list", () => {
    const prompts = buildGiftPrompts({
      interests: ["music", "cooking"],
      budget: 120,
      constraints: "no perfume",
      partner_profile_id: undefined,
    });

    expect(prompts.user).toContain("music, cooking");
    expect(prompts.user).toContain("120");
  });

  it("builds letter prompts with memory numbering", () => {
    const prompts = buildLoveLetterPrompts({
      tone: "warm",
      length: "medium",
      partner_name: "Ava",
      memories: ["Our first date", "Roadtrip"],
    });

    expect(prompts.user).toContain("1. Our first date");
    expect(prompts.user).toContain("2. Roadtrip");
  });
});
