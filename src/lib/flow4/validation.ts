export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ScenarioFieldKey = "scenario";

export type ScenarioFormInput = {
  scenario: string;
};

function isBlank(value: string) {
  return value.trim().length === 0;
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

export function validateScenarioForm(
  input: ScenarioFormInput,
): FieldErrors<ScenarioFieldKey> {
  const errors: FieldErrors<ScenarioFieldKey> = {};

  if (isBlank(input.scenario)) {
    errors.scenario = "Scenario is required.";
  } else if (input.scenario.trim().length < 2) {
    errors.scenario = "Scenario must be at least 2 characters.";
  } else if (input.scenario.trim().length > 300) {
    errors.scenario = "Scenario must be 300 characters or fewer.";
  }

  return errors;
}
