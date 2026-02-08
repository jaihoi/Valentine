import type {
  DatePlanRequest,
  GiftRequest,
  LoveLetterRequest,
} from "@/lib/api/schemas";

export function buildDatePlanPrompts(input: DatePlanRequest) {
  return {
    system:
      "You are a Valentine concierge. Return strict JSON with keys: itinerary, venue_options, estimated_cost, rationale.",
    user: `City: ${input.city}
Budget USD: ${input.budget}
Vibe: ${input.vibe}
Dietary: ${input.dietary ?? "none"}
Date time: ${input.date_time ?? "not specified"}
Create a practical plan with 3 to 5 itinerary items.`,
  };
}

export function buildGiftPrompts(input: GiftRequest) {
  return {
    system:
      "You recommend thoughtful gifts. Return strict JSON with keys: recommendations, explanation, links.",
    user: `Interests: ${input.interests.join(", ")}
Budget USD: ${input.budget}
Constraints: ${input.constraints ?? "none"}
Create 3 to 5 gift options with estimated_price integer.`,
  };
}

export function buildLoveLetterPrompts(input: LoveLetterRequest) {
  return {
    system:
      "You write heartfelt but tasteful romantic content. Return strict JSON with keys: letter_text, short_sms, caption_versions.",
    user: `Partner name: ${input.partner_name}
Tone: ${input.tone}
Length: ${input.length}
Memories:
${input.memories.map((memory, index) => `${index + 1}. ${memory}`).join("\n")}`,
  };
}
