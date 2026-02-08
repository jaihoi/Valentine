import { describe, expect, it } from "vitest";
import { allowCardPreviewFallback } from "@/lib/jobs/card-job";

describe("card job strictness policy", () => {
  it("disables fallback for flow3 cards in production", () => {
    expect(allowCardPreviewFallback("production", true)).toBe(false);
  });

  it("allows fallback for non-flow3 cards in production", () => {
    expect(allowCardPreviewFallback("production", false)).toBe(true);
  });

  it("allows fallback for flow3 cards outside production", () => {
    expect(allowCardPreviewFallback("development", true)).toBe(true);
    expect(allowCardPreviewFallback("test", true)).toBe(true);
  });
});
