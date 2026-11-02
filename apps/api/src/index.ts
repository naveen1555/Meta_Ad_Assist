import http from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { registerJobHandlers } from "./jobs";
import { initSocket } from "./lib/socket";
import { startWorker } from "./queue";
import { recoverBroadcasts } from "./services/broadcasts";

async function main() {
  registerJobHandlers();
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  // On the Railway Hobby plan the worker runs inside the API process; set RUN_WORKER=false
  // and deploy `npm run start:worker` as a separate service to scale it independently.
  const worker = config.runWorker ? startWorker() : null;
  await recoverBroadcasts();

  server.listen(config.port, () => {
    console.log(`[api] listening on :${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await worker?.close().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
