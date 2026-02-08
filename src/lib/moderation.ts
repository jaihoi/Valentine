import OpenAI from "openai";
import { env } from "@/lib/env";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";

const fallbackBlockedWords = [
  "self-harm",
  "kill",
  "violent attack",
  "hate speech",
];

const openai = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export async function moderateText(text: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  if (!text.trim()) return { allowed: false, reason: "Empty content" };

  if (!openai) {
    const lowered = text.toLowerCase();
    const blocked = fallbackBlockedWords.find((word) => lowered.includes(word));
    return blocked
      ? { allowed: false, reason: `Blocked phrase matched: ${blocked}` }
      : { allowed: true };
  }

  try {
    const response = await withCircuitBreaker("openai-moderation", () =>
      withRetry(() =>
        openai.moderations.create({
          model: "omni-moderation-latest",
          input: text,
        }),
      ),
    );
    const result = response.results[0];
    if (!result) return { allowed: true };
    return {
      allowed: !result.flagged,
      reason: result.flagged ? "OpenAI moderation flagged content." : undefined,
    };
  } catch {
    return { allowed: true };
  }
}
