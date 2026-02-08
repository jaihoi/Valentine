import { describe, expect, it } from "vitest";
import { parseGiftInterests, validateGiftForm } from "@/lib/flow5/validation";

describe("flow5 validation", () => {
  it("rejects empty interests", () => {
    const errors = validateGiftForm({
      interestsText: " , ",
      budgetText: "120",
      constraints: "",
    });
    expect(errors.interests).toBe("Add at least one interest.");
  });

  it("rejects invalid budget values", () => {
    const errors = validateGiftForm({
      interestsText: "music,dinner",
      budgetText: "0",
      constraints: "",
    });
    expect(errors.budget).toBe("Budget must be greater than 0.");
  });

  it("rejects constraints that exceed max length", () => {
    const errors = validateGiftForm({
      interestsText: "music",
      budgetText: "100",
      constraints: "x".repeat(301),
    });
    expect(errors.constraints).toBe(
      "Constraints must be 300 characters or fewer.",
    );
  });

  it("accepts valid gift input", () => {
    const errors = validateGiftForm({
      interestsText: "music, dinner ,travel",
      budgetText: "150",
      constraints: "no jewelry",
    });
    expect(errors).toEqual({});
    expect(parseGiftInterests("music, dinner ,travel")).toEqual([
      "music",
      "dinner",
      "travel",
    ]);
  });
});
