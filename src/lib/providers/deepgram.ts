import { env } from "@/lib/env";
import { withCircuitBreaker, withRetry } from "@/lib/resilience";

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
};

export async function transcribeAudioUrl(audioUrl: string): Promise<string> {
  if (!env.DEEPGRAM_API_KEY) {
    return "";
  }

  try {
    const response = await withCircuitBreaker("deepgram-transcribe", () =>
      withRetry(() =>
        fetch("https://api.deepgram.com/v1/listen?model=nova-2", {
          method: "POST",
          headers: {
            Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: audioUrl }),
        }),
      ),
    );

    if (!response.ok) {
      return "";
    }

    const json = (await response.json()) as DeepgramResponse;
    return (
      json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ""
    );
  } catch {
    return "";
  }
}
