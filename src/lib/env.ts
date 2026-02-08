import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/valentine?schema=public"),
  JWT_SECRET: z.string().default("unsafe-dev-secret"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().optional(),
  FASTROUTER_API_KEY: z.string().optional(),
  FASTROUTER_API_URL: z
    .string()
    .default("https://go.fastrouter.ai/api/v1/chat/completions"),
  FASTROUTER_MODEL: z.string().default("openai/gpt-5.2"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  PERPLEXITY_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_WEBHOOK_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  ENFORCE_PROD_ENV_VALIDATION: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

const parsedEnv = envSchema.parse(process.env);

const shouldEnforceProdChecks =
  parsedEnv.NODE_ENV === "production" &&
  (parsedEnv.ENFORCE_PROD_ENV_VALIDATION === "true" ||
    process.env.VERCEL === "1");

if (shouldEnforceProdChecks) {
  const missing: string[] = [];

  if (!parsedEnv.DATABASE_URL) missing.push("DATABASE_URL");
  if (!parsedEnv.APP_BASE_URL) missing.push("APP_BASE_URL");
  if (!parsedEnv.REDIS_URL) missing.push("REDIS_URL");
  if (!parsedEnv.POSTHOG_API_KEY) missing.push("POSTHOG_API_KEY");
  if (!parsedEnv.VAPI_WEBHOOK_SECRET) missing.push("VAPI_WEBHOOK_SECRET");
  if (!parsedEnv.CLOUDINARY_WEBHOOK_SECRET) {
    missing.push("CLOUDINARY_WEBHOOK_SECRET");
  }

  if (parsedEnv.JWT_SECRET === "unsafe-dev-secret") {
    missing.push("JWT_SECRET (must not use default)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or unsafe production environment variables: ${missing.join(", ")}`,
    );
  }
}

export const env = parsedEnv;
