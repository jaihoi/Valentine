export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ManualAssetFieldKey =
  | "cloudinary_id"
  | "secure_url"
  | "resource_type";
export type CardFieldKey = "asset_ids" | "template_id" | "message_text";

export type ManualAssetFormInput = {
  cloudinary_id: string;
  secure_url: string;
  resource_type: string;
};

export type CardFormInput = {
  asset_ids: string[];
  template_id: string;
  message_text: string;
};

function isBlank(value: string) {
  return value.trim().length === 0;
}

function isUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

export function validateManualAssetForm(
  input: ManualAssetFormInput,
): FieldErrors<ManualAssetFieldKey> {
  const errors: FieldErrors<ManualAssetFieldKey> = {};

  if (isBlank(input.cloudinary_id)) {
    errors.cloudinary_id = "Cloudinary public id is required.";
  }

  if (isBlank(input.secure_url)) {
    errors.secure_url = "Secure URL is required.";
  } else if (!isUrl(input.secure_url.trim())) {
    errors.secure_url = "Secure URL must be a valid http(s) URL.";
  }

  if (!["image", "video", "raw"].includes(input.resource_type)) {
    errors.resource_type = "Resource type must be image, video, or raw.";
  }

  return errors;
}

export function validateCardForm(input: CardFormInput): FieldErrors<CardFieldKey> {
  const errors: FieldErrors<CardFieldKey> = {};

  if (input.asset_ids.length === 0) {
    errors.asset_ids = "Select at least one memory asset.";
  }

  if (isBlank(input.template_id)) {
    errors.template_id = "Template id is required.";
  } else if (input.template_id.trim().length > 80) {
    errors.template_id = "Template id must be 80 characters or fewer.";
  }

  if (isBlank(input.message_text)) {
    errors.message_text = "Message text is required.";
  } else if (input.message_text.trim().length > 240) {
    errors.message_text = "Message text must be 240 characters or fewer.";
  }

  return errors;
}
