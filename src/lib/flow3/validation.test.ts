import { describe, expect, it } from "vitest";
import { validateCardForm, validateManualAssetForm } from "@/lib/flow3/validation";

describe("flow3 validation", () => {
  it("validates manual asset requirements", () => {
    const errors = validateManualAssetForm({
      cloudinary_id: " ",
      secure_url: "not-a-url",
      resource_type: "bad",
    });

    expect(errors.cloudinary_id).toBe("Cloudinary public id is required.");
    expect(errors.secure_url).toBe("Secure URL must be a valid http(s) URL.");
    expect(errors.resource_type).toBe("Resource type must be image, video, or raw.");
  });

  it("accepts valid manual asset payload", () => {
    const errors = validateManualAssetForm({
      cloudinary_id: "valentine/user-abc/memory-assets/photo-1",
      secure_url: "https://res.cloudinary.com/demo/image/upload/photo-1.jpg",
      resource_type: "image",
    });
    expect(errors).toEqual({});
  });

  it("validates card form constraints", () => {
    const errors = validateCardForm({
      asset_ids: [],
      template_id: " ",
      message_text: " ",
    });

    expect(errors.asset_ids).toBe("Select at least one memory asset.");
    expect(errors.template_id).toBe("Template id is required.");
    expect(errors.message_text).toBe("Message text is required.");
  });

  it("accepts valid card form payload", () => {
    const errors = validateCardForm({
      asset_ids: ["cm0p4kqsf0001a0i7sd8udxv0"],
      template_id: "classic-rose",
      message_text: "Forever my favorite person.",
    });

    expect(errors).toEqual({});
  });
});
