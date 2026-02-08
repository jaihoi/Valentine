import { describe, expect, it } from "vitest";
import { generateStructuredJson } from "@/lib/providers/openai";

describe("openai provider", () => {
  it("returns fallback data when provider is unavailable", async () => {
    const fallback = { hello: "world" };
    const result = await generateStructuredJson(
      "Return JSON",
      "Say hello",
      fallback,
    );
    expect(result).toEqual(fallback);
  });
});
