import { describe, expect, it } from "vitest";
import { validateScenarioForm } from "@/lib/flow4/validation";

describe("flow4 validation", () => {
  it("rejects empty scenario", () => {
    const errors = validateScenarioForm({ scenario: " " });
    expect(errors.scenario).toBe("Scenario is required.");
  });

  it("rejects too-long scenario", () => {
    const errors = validateScenarioForm({ scenario: "a".repeat(301) });
    expect(errors.scenario).toBe("Scenario must be 300 characters or fewer.");
  });

  it("accepts valid scenario", () => {
    const errors = validateScenarioForm({
      scenario: "Help me run a thoughtful, warm Valentine check-in call.",
    });
    expect(errors).toEqual({});
  });
});
