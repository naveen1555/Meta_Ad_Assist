import { prisma } from "./db";
import { registerJobHandlers } from "./jobs";
import { startWorker } from "./queue";

registerJobHandlers();
const worker = startWorker();
if (!worker) {
  console.error("[worker] REDIS_URL is required to run a standalone worker");
  process.exit(1);
}

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
