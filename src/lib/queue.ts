import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processCardProject } from "@/lib/jobs/card-job";

type CardJobPayload = {
  cardId: string;
};

let connection: IORedis | null = null;
let cardsQueue: Queue<CardJobPayload> | null = null;

if (env.REDIS_URL) {
  connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  cardsQueue = new Queue<CardJobPayload>("card-generation", { connection });
}

export async function enqueueCardGeneration(cardId: string): Promise<void> {
  if (!cardsQueue) {
    await processCardProject(cardId);
    return;
  }

  await cardsQueue.add(
    "generate-card",
    { cardId },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: 200,
      removeOnFail: 200,
    },
  );
}

export function createCardsWorker(): Worker<CardJobPayload> | null {
  if (!connection) {
    logger.warn("REDIS_URL missing. Card worker not started.");
    return null;
  }

  const worker = new Worker<CardJobPayload>(
    "card-generation",
    async (job) => {
      await processCardProject(job.data.cardId);
    },
    { connection },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Card job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error }, "Card job failed");
  });

  return worker;
}
