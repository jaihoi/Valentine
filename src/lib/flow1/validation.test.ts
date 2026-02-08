import { describe, expect, it } from "vitest";
import {
  validateAuthForm,
  validateDateForm,
  validatePartnerForm,
} from "@/lib/flow1/validation";

describe("flow1 validation", () => {
  it("validates auth email and password", () => {
    const errors = validateAuthForm(
      {
        name: "",
        email: "invalid",
        password: "short",
      },
      "login",
    );

    expect(errors.email).toBe("Enter a valid email address.");
    expect(errors.password).toBe("Password must be at least 8 characters.");
  });

  it("requires name when registering", () => {
    const errors = validateAuthForm(
      {
        name: "",
        email: "user@example.com",
        password: "password123",
      },
      "register",
    );

    expect(errors.name).toBe("Name is required to register.");
  });

  it("validates partner profile name and interests", () => {
    const errors = validatePartnerForm({
      name: "",
      interests: " , , ",
    });

    expect(errors.name).toBe("Partner name is required.");
    expect(errors.interests).toBe("Add at least one interest.");
  });

  it("validates date fields", () => {
    const errors = validateDateForm({
      city: " ",
      budget: 0,
      vibe: "",
      date_time: "not-a-date",
    });

    expect(errors.city).toBe("City is required.");
    expect(errors.budget).toBe("Budget must be greater than 0.");
    expect(errors.vibe).toBe("Vibe is required.");
    expect(errors.date_time).toBe("Date time must be a valid date/time value.");
  });

  it("returns no errors for valid payloads", () => {
    expect(
      validateAuthForm(
        {
          name: "Ava",
          email: "ava@example.com",
          password: "password123",
        },
        "register",
      ),
    ).toEqual({});

    expect(
      validatePartnerForm({
        name: "Taylor",
        interests: "music,dinner,travel",
      }),
    ).toEqual({});

    expect(
      validateDateForm({
        city: "Austin",
        budget: 120,
        vibe: "cozy",
        date_time: "2026-02-14T19:00:00.000Z",
      }),
    ).toEqual({});
  });
});
