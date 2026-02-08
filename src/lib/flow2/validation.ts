export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type LetterLength = "short" | "medium" | "long";
export type LetterFieldKey = "tone" | "length" | "memories";
export type VoiceFieldKey = "source_content_id" | "text";

export type LetterFormInput = {
  tone: string;
  length: LetterLength;
  memoriesText: string;
};

export type VoiceFormInput = {
  source_content_id: string;
  text: string;
};

function isBlank(value: string) {
  return value.trim().length === 0;
}

export function parseMemories(value: string): string[] {
  return value
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasFieldErrors<K extends string>(errors: FieldErrors<K>) {
  return Object.values(errors).some(Boolean);
}

export function firstErrorKey<K extends string>(errors: FieldErrors<K>): K | null {
  const entries = Object.entries(errors) as Array<[K, string | undefined]>;
  for (const [key, message] of entries) {
    if (message) return key;
  }
  return null;
}

export function validateLetterForm(
  input: LetterFormInput,
): FieldErrors<LetterFieldKey> {
  const errors: FieldErrors<LetterFieldKey> = {};

  if (isBlank(input.tone) || input.tone.trim().length < 2) {
    errors.tone = "Tone must be at least 2 characters.";
  } else if (input.tone.trim().length > 50) {
    errors.tone = "Tone must be at most 50 characters.";
  }

  if (!["short", "medium", "long"].includes(input.length)) {
    errors.length = "Length must be short, medium, or long.";
  }

  const memories = parseMemories(input.memoriesText);
  if (memories.length === 0) {
    errors.memories = "Add at least one memory.";
  } else if (memories.length > 8) {
    errors.memories = "Use at most 8 memories.";
  }

  return errors;
}

export function validateVoiceForm(
  input: VoiceFormInput,
): FieldErrors<VoiceFieldKey> {
  const errors: FieldErrors<VoiceFieldKey> = {};

  if (isBlank(input.source_content_id)) {
    errors.source_content_id = "Generate letter content before voice creation.";
  }

  if (isBlank(input.text)) {
    errors.text = "Voice text is required.";
  } else if (input.text.trim().length > 2000) {
    errors.text = "Voice text must be 2000 characters or fewer.";
  }

  return errors;
}
