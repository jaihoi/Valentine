import { describe, expect, it } from "vitest";
import { searchWebContext } from "@/lib/providers/perplexity";

describe("perplexity provider", () => {
  it("returns safe fallback when key is absent or request fails", async () => {
    const result = await searchWebContext("romantic restaurants in boston");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("links");
    expect(Array.isArray(result.links)).toBe(true);
  });
});
