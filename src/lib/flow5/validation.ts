export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type GiftFieldKey = "interests" | "budget" | "constraints";

export type GiftFormInput = {
  interestsText: string;
  budgetText: string;
  constraints: string;
};

export function parseGiftInterests(value: string): string[] {
  return value
    .split(",")
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

export function validateGiftForm(input: GiftFormInput): FieldErrors<GiftFieldKey> {
  const errors: FieldErrors<GiftFieldKey> = {};

  if (parseGiftInterests(input.interestsText).length === 0) {
    errors.interests = "Add at least one interest.";
  }

  if (!input.budgetText.trim()) {
    errors.budget = "Budget is required.";
  } else {
    const numericBudget = Number(input.budgetText);
    if (!Number.isInteger(numericBudget) || Number.isNaN(numericBudget)) {
      errors.budget = "Budget must be a whole number.";
    } else if (numericBudget <= 0) {
      errors.budget = "Budget must be greater than 0.";
    } else if (numericBudget > 100000) {
      errors.budget = "Budget must be 100000 or less.";
    }
  }

  if (input.constraints.trim().length > 300) {
    errors.constraints = "Constraints must be 300 characters or fewer.";
  }

  return errors;
}
