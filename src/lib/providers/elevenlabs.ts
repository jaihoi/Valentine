import { env } from "@/lib/env";
import { FlowError } from "@/lib/flow-errors";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/network";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";

export async function synthesizeVoice(
  text: string,
  voiceId?: string,
): Promise<Buffer | null> {
  if (!env.ELEVENLABS_API_KEY) {
    return null;
  }

  const targetVoiceId = voiceId ?? env.ELEVENLABS_VOICE_ID;
  if (!targetVoiceId) {
    return null;
  }

  try {
    const response = await withCircuitBreaker("elevenlabs-tts", () =>
      withRetry(() =>
        fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
            targetVoiceId,
          )}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": env.ELEVENLABS_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_turbo_v2_5",
              output_format: "mp3_44100_128",
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.85,
              },
            }),
          },
        ),
      ),
    );

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

type StrictOptions = {
  timeoutMs?: number;
  retries?: number;
};

export async function synthesizeVoiceStrict(
  text: string,
  voiceId?: string,
  options: StrictOptions = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 6_000;
  const retries = options.retries ?? 0;

  if (!env.ELEVENLABS_API_KEY) {
    throw new FlowError("ElevenLabs API key is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "elevenlabs",
    });
  }

  const targetVoiceId = voiceId ?? env.ELEVENLABS_VOICE_ID;
  if (!targetVoiceId) {
    throw new FlowError("ElevenLabs voice id is not configured", {
      code: "PROVIDER_CONFIG_MISSING",
      status: 503,
      retryable: false,
      provider: "elevenlabs",
    });
  }

  try {
    const response = await withCircuitBreaker("elevenlabs-tts", () =>
      withRetry(
        () =>
          fetchWithTimeout(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
              targetVoiceId,
            )}`,
            {
              method: "POST",
              headers: {
                "xi-api-key": env.ELEVENLABS_API_KEY!,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5",
                output_format: "mp3_44100_128",
                voice_settings: {
                  stability: 0.4,
                  similarity_boost: 0.85,
                },
              }),
            },
            timeoutMs,
          ),
        { retries },
      ),
    );

    if (!response.ok) {
      throw new FlowError(
        `ElevenLabs request failed with status ${response.status}`,
        {
          code: "PROVIDER_ENRICHMENT_FAILED",
          status: 502,
          retryable: true,
          provider: "elevenlabs",
        },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      throw new FlowError("ElevenLabs returned empty audio payload", {
        code: "PROVIDER_ENRICHMENT_FAILED",
        status: 502,
        retryable: true,
        provider: "elevenlabs",
      });
    }

    return buffer;
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new FlowError(error.message, {
        code: "PROVIDER_TIMEOUT",
        status: 504,
        retryable: true,
        provider: "elevenlabs",
      });
    }
    if (error instanceof FlowError) {
      throw error;
    }
    throw new FlowError("ElevenLabs synthesis failed", {
      code: "PROVIDER_ENRICHMENT_FAILED",
      status: 502,
      retryable: true,
      provider: "elevenlabs",
      details: String(error),
    });
  }
}
