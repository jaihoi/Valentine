import { describe, expect, it } from "vitest";
import { rankRecommendations, scoreRecommendation } from "@/lib/ai/ranking";

describe("gift ranking", () => {
  it("scores interest matches and budget fit", () => {
    const score = scoreRecommendation(
      {
        title: "Vinyl Record Player",
        reason: "Great for music nights together",
        estimated_price: 95,
      },
      {
        budget: 100,
        interests: ["music", "movies"],
      },
    );

    expect(score).toBeGreaterThan(60);
  });

  it("sorts recommendations deterministically", () => {
    const ranked = rankRecommendations(
      [
        {
          title: "Generic Candle",
          reason: "Nice smell",
          estimated_price: 30,
        },
        {
          title: "Cooking Class Voucher",
          reason: "Great for cooking together",
          estimated_price: 85,
        },
      ],
      { budget: 100, interests: ["cooking"] },
    );

    expect(ranked[0]?.title).toBe("Cooking Class Voucher");
  });
});
