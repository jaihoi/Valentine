import { createCardsWorker } from "@/lib/queue";
import { logger } from "@/lib/logger";

const worker = createCardsWorker();

if (!worker) {
  process.exit(0);
}

logger.info("Card worker started");
