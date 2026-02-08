import { describe, expect, it } from "vitest";
import {
  parseMemories,
  validateLetterForm,
  validateVoiceForm,
} from "@/lib/flow2/validation";

describe("flow2 validation", () => {
  it("parses memories from newlines and semicolons", () => {
    const memories = parseMemories("first date;\nweekend trip; late-night talks");
    expect(memories).toEqual([
      "first date",
      "weekend trip",
      "late-night talks",
    ]);
  });

  it("validates letter form constraints", () => {
    const errors = validateLetterForm({
      tone: "a",
      length: "medium",
      memoriesText: " ",
    });

    expect(errors.tone).toBe("Tone must be at least 2 characters.");
    expect(errors.memories).toBe("Add at least one memory.");
  });

  it("rejects too many memories", () => {
    const errors = validateLetterForm({
      tone: "romantic",
      length: "long",
      memoriesText: "1;2;3;4;5;6;7;8;9",
    });
    expect(errors.memories).toBe("Use at most 8 memories.");
  });

  it("validates voice form requirements", () => {
    const errors = validateVoiceForm({
      source_content_id: "",
      text: " ",
    });

    expect(errors.source_content_id).toBe(
      "Generate letter content before voice creation.",
    );
    expect(errors.text).toBe("Voice text is required.");
  });

  it("accepts valid letter and voice payloads", () => {
    expect(
      validateLetterForm({
        tone: "heartfelt",
        length: "medium",
        memoriesText: "first date;road trip",
      }),
    ).toEqual({});

    expect(
      validateVoiceForm({
        source_content_id: "cm0p4kqsf0000a0i7sd8udxv9",
        text: "Happy Valentine's Day, my love.",
      }),
    ).toEqual({});
  });
});
