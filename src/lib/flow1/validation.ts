export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type AuthSubmitMode = "register" | "login";

export type AuthFieldKey = "name" | "email" | "password";
export type PartnerFieldKey = "name" | "interests";
export type DateFieldKey = "city" | "budget" | "vibe" | "date_time";

export type AuthFormInput = {
  name: string;
  email: string;
  password: string;
};

export type PartnerFormInput = {
  name: string;
  interests: string;
};

export type DateFormInput = {
  city: string;
  budget: number;
  vibe: string;
  date_time: string;
};

function isBlank(value: string) {
  return value.trim().length === 0;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseCommaSeparatedValues(value: string) {
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

export function validateAuthForm(
  input: AuthFormInput,
  mode: AuthSubmitMode,
): FieldErrors<AuthFieldKey> {
  const errors: FieldErrors<AuthFieldKey> = {};

  if (mode === "register" && isBlank(input.name)) {
    errors.name = "Name is required to register.";
  }

  if (isBlank(input.email)) {
    errors.email = "Email is required.";
  } else if (!isValidEmail(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (isBlank(input.password)) {
    errors.password = "Password is required.";
  } else if (input.password.trim().length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return errors;
}

export function validatePartnerForm(
  input: PartnerFormInput,
): FieldErrors<PartnerFieldKey> {
  const errors: FieldErrors<PartnerFieldKey> = {};

  if (isBlank(input.name)) {
    errors.name = "Partner name is required.";
  }

  if (parseCommaSeparatedValues(input.interests).length === 0) {
    errors.interests = "Add at least one interest.";
  }

  return errors;
}

export function validateDateForm(input: DateFormInput): FieldErrors<DateFieldKey> {
  const errors: FieldErrors<DateFieldKey> = {};

  if (isBlank(input.city)) {
    errors.city = "City is required.";
  }

  if (!Number.isFinite(input.budget) || input.budget <= 0) {
    errors.budget = "Budget must be greater than 0.";
  }

  if (isBlank(input.vibe)) {
    errors.vibe = "Vibe is required.";
  }

  if (!isBlank(input.date_time) && Number.isNaN(Date.parse(input.date_time))) {
    errors.date_time = "Date time must be a valid date/time value.";
  }

  return errors;
}
