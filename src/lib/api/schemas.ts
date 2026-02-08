import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const partnerProfileSchema = z.object({
  name: z.string().min(1).max(80),
  interests: z.array(z.string()).min(1),
  dislikes: z.array(z.string()).optional().default([]),
  notes: z.string().max(600).optional(),
});

export const datePlanRequestSchema = z.object({
  city: z.string().min(2).max(100),
  budget: z.number().int().min(1).max(100000),
  vibe: z.string().min(2).max(100),
  dietary: z.string().max(200).optional(),
  date_time: z.string().datetime().optional(),
  partner_profile_id: z.string().cuid().optional(),
});

export const datePlanResponseSchema = z.object({
  plan_id: z.string(),
  itinerary: z.array(
    z.object({
      time: z.string(),
      activity: z.string(),
      details: z.string(),
    }),
  ),
  venue_options: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
      link: z.string().url().optional(),
    }),
  ),
  estimated_cost: z.number().int().min(0),
  rationale: z.string(),
  sources: z
    .object({
      perplexity_links: z.array(z.string().url()),
      firecrawl_extracts_count: z.number().int().min(0),
    })
    .optional(),
});

export const giftRequestSchema = z.object({
  interests: z.array(z.string()).min(1),
  budget: z.number().int().min(1).max(100000),
  constraints: z.string().max(300).optional(),
  partner_profile_id: z.string().cuid().optional(),
});

export const giftResponseSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      estimated_price: z.number().int().min(0),
    }),
  ),
  explanation: z.string(),
  links: z.array(z.string().url()),
});

export const loveLetterRequestSchema = z.object({
  tone: z.string().min(2).max(50),
  length: z.enum(["short", "medium", "long"]),
  memories: z.array(z.string()).min(1).max(8),
  partner_name: z.string().min(1).max(100),
});

export const loveLetterResponseSchema = z.object({
  letter_text: z.string(),
  short_sms: z.string(),
  caption_versions: z.array(z.string()),
});

export const voiceRequestSchema = z.object({
  text: z.string().min(2).max(2000),
  voice_id: z.string().optional(),
  style: z.string().max(80).optional(),
});

export const voiceResponseSchema = z.object({
  audio_asset_id: z.string(),
  audio_url: z.string().url(),
});

export const cardGenerateRequestSchema = z.object({
  asset_ids: z.array(z.string().cuid()).min(1),
  template_id: z.string().min(1).max(80),
  message_text: z.string().min(1).max(240),
  music_option: z.string().max(120).optional(),
});

export const cardGenerateResponseSchema = z.object({
  card_id: z.string(),
  preview_url: z.string().url().nullable(),
  status: z.enum(["QUEUED", "PROCESSING", "READY", "FAILED"]),
});

export const vapiStartRequestSchema = z.object({
  user_id: z.string().cuid(),
  scenario: z.string().min(2).max(300),
  partner_profile_id: z.string().cuid().optional(),
});

export const vapiStartResponseSchema = z.object({
  session_id: z.string(),
  call_link_or_number: z.string(),
});

export const flow2LoveLetterRequestSchema = z.object({
  partner_profile_id: z.string().cuid(),
  tone: z.string().min(2).max(50),
  length: z.enum(["short", "medium", "long"]),
  memories: z.array(z.string().min(1).max(400)).min(1).max(8),
});

export const flow2LoveLetterResponseSchema = z.object({
  letter_content_id: z.string().cuid(),
  letter_text: z.string(),
  short_sms: z.string(),
  caption_versions: z.array(z.string()),
});

export const flow2VoiceRequestSchema = z.object({
  source_content_id: z.string().cuid(),
  text: z.string().min(2).max(2000),
  partner_profile_id: z.string().cuid(),
  voice_id: z.string().max(120).optional(),
  style: z.string().max(80).optional(),
});

export const flow2VoiceResponseSchema = z.object({
  audio_asset_id: z.string().cuid(),
  audio_url: z.string().url(),
});

export const flow3CardGenerateRequestSchema = z.object({
  partner_profile_id: z.string().cuid(),
  asset_ids: z.array(z.string().cuid()).min(1),
  template_id: z.string().min(1).max(80),
  message_text: z.string().min(1).max(240),
  music_option: z.string().max(120).optional(),
});

export const flow3CardGenerateResponseSchema = z.object({
  card_id: z.string().cuid(),
  status: z.enum(["QUEUED", "PROCESSING", "READY", "FAILED"]),
  preview_url: z.string().url().nullable(),
});

export const flow3CardStatusResponseSchema = z.object({
  card_id: z.string().cuid(),
  status: z.enum(["QUEUED", "PROCESSING", "READY", "FAILED"]),
  preview_url: z.string().url().nullable(),
  error_message: z.string().nullable().optional(),
});

export const flow3HistoryResponseSchema = z.object({
  partner_profiles: z.array(
    z.object({
      id: z.string().cuid(),
      name: z.string(),
      interests: z.array(z.string()),
      notes: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
  memory_assets: z.array(
    z.object({
      id: z.string().cuid(),
      cloudinaryId: z.string(),
      secureUrl: z.string().url(),
      resourceType: z.string(),
      createdAt: z.string(),
    }),
  ),
  cards: z.array(
    z.object({
      id: z.string().cuid(),
      partnerProfileId: z.string().cuid().nullable().optional(),
      templateId: z.string(),
      messageText: z.string(),
      musicOption: z.string().nullable().optional(),
      status: z.enum(["QUEUED", "PROCESSING", "READY", "FAILED"]),
      previewUrl: z.string().url().nullable(),
      errorMessage: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
});

export const flow4SessionStartRequestSchema = z.object({
  partner_profile_id: z.string().cuid(),
  scenario: z.string().min(2).max(300),
});

export const flow4SessionStartResponseSchema = z.object({
  session_id: z.string().cuid(),
  call_link_or_number: z.string().url(),
  status: z.enum(["CREATED", "ACTIVE", "COMPLETED", "FAILED"]),
});

export const flow4SessionStatusResponseSchema = z.object({
  session_id: z.string().cuid(),
  call_link_or_number: z.string().url().nullable(),
  status: z.enum(["CREATED", "ACTIVE", "COMPLETED", "FAILED"]),
  updated_at: z.string(),
  provider_meta: z.record(z.string(), z.unknown()).optional(),
});

export const flow4HistoryResponseSchema = z.object({
  partner_profiles: z.array(
    z.object({
      id: z.string().cuid(),
      name: z.string(),
      interests: z.array(z.string()),
      notes: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
  voice_sessions: z.array(
    z.object({
      id: z.string().cuid(),
      partnerProfileId: z.string().cuid().nullable().optional(),
      scenario: z.string(),
      callLinkOrNumber: z.string().nullable().optional(),
      status: z.enum(["CREATED", "ACTIVE", "COMPLETED", "FAILED"]),
      createdAt: z.string(),
      updatedAt: z.string(),
      providerMeta: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

export const flow5GiftRequestSchema = z.object({
  partner_profile_id: z.string().cuid(),
  interests: z.array(z.string().min(1).max(100)).min(1).max(20),
  budget: z.number().int().min(1).max(100000),
  constraints: z.string().max(300).optional(),
});

export const flow5GiftResponseSchema = z.object({
  gift_recommendation_id: z.string().cuid(),
  recommendations: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      estimated_price: z.number().int().min(0),
    }),
  ),
  explanation: z.string(),
  links: z.array(z.string().url()),
  sources: z.object({
    perplexity_links: z.array(z.string().url()),
    firecrawl_extracts_count: z.number().int().min(0),
  }),
});

export const flow5HistoryResponseSchema = z.object({
  partner_profiles: z.array(
    z.object({
      id: z.string().cuid(),
      name: z.string(),
      interests: z.array(z.string()),
      notes: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
  gift_recommendations: z.array(
    z.object({
      id: z.string().cuid(),
      partnerProfileId: z.string().cuid().nullable().optional(),
      interests: z.array(z.string()),
      budget: z.number().int().min(1),
      constraints: z.string().nullable().optional(),
      recommendations: z.array(
        z.object({
          title: z.string(),
          reason: z.string(),
          estimated_price: z.number().int().min(0),
        }),
      ),
      explanation: z.string(),
      links: z.array(z.string().url()),
      providerMeta: z.record(z.string(), z.unknown()).optional(),
      createdAt: z.string(),
    }),
  ),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PartnerProfileInput = z.infer<typeof partnerProfileSchema>;
export type DatePlanRequest = z.infer<typeof datePlanRequestSchema>;
export type DatePlanResponse = z.infer<typeof datePlanResponseSchema>;
export type GiftRequest = z.infer<typeof giftRequestSchema>;
export type GiftResponse = z.infer<typeof giftResponseSchema>;
export type LoveLetterRequest = z.infer<typeof loveLetterRequestSchema>;
export type LoveLetterResponse = z.infer<typeof loveLetterResponseSchema>;
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;
export type CardGenerateRequest = z.infer<typeof cardGenerateRequestSchema>;
export type VapiStartRequest = z.infer<typeof vapiStartRequestSchema>;
export type Flow2LoveLetterRequest = z.infer<typeof flow2LoveLetterRequestSchema>;
export type Flow2LoveLetterResponse = z.infer<typeof flow2LoveLetterResponseSchema>;
export type Flow2VoiceRequest = z.infer<typeof flow2VoiceRequestSchema>;
export type Flow2VoiceResponse = z.infer<typeof flow2VoiceResponseSchema>;
export type Flow3CardGenerateRequest = z.infer<
  typeof flow3CardGenerateRequestSchema
>;
export type Flow3CardGenerateResponse = z.infer<
  typeof flow3CardGenerateResponseSchema
>;
export type Flow3CardStatusResponse = z.infer<
  typeof flow3CardStatusResponseSchema
>;
export type Flow3HistoryResponse = z.infer<typeof flow3HistoryResponseSchema>;
export type Flow4SessionStartRequest = z.infer<
  typeof flow4SessionStartRequestSchema
>;
export type Flow4SessionStartResponse = z.infer<
  typeof flow4SessionStartResponseSchema
>;
export type Flow4SessionStatusResponse = z.infer<
  typeof flow4SessionStatusResponseSchema
>;
export type Flow4HistoryResponse = z.infer<typeof flow4HistoryResponseSchema>;
export type Flow5GiftRequest = z.infer<typeof flow5GiftRequestSchema>;
export type Flow5GiftResponse = z.infer<typeof flow5GiftResponseSchema>;
export type Flow5HistoryResponse = z.infer<typeof flow5HistoryResponseSchema>;
