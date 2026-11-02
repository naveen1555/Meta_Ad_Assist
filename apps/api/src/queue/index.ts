import { Queue, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export type JobName =
  | "broadcast.send"
  | "flow.resume"
  | "integration.deliver"
  | "lead.process"
  | "media.download";

export type JobHandler = (data: any) => Promise<void>;

const QUEUE_NAME = "chatnova";

let handlers: Partial<Record<JobName, JobHandler>> = {};
let queue: Queue | null = null;
let connection: IORedis | null = null;

function getConnection() {
  if (!config.redisUrl) return null;
  if (!connection) {
    connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, family: 0 });
  }
  return connection;
}

function getQueue() {
  const conn = getConnection();
  if (!conn) return null;
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: conn as ConnectionOptions });
  return queue;
}

export function setHandlers(map: Partial<Record<JobName, JobHandler>>) {
  handlers = map;
}

export const usingRedis = () => Boolean(config.redisUrl);

/**
 * Adds a background job. With REDIS_URL set, jobs go to BullMQ (durable, retried).
 * Without Redis (local development), jobs run in-process after the delay.
 */
export async function enqueue(name: JobName, data: unknown, opts: { delayMs?: number; jobId?: string } = {}) {
  const q = getQueue();
  if (q) {
    await q.add(name, data, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      attempts: name === "broadcast.send" ? 1 : 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return;
  }
  setTimeout(() => {
    const handler = handlers[name];
    if (!handler) return console.error(`[queue] no handler for ${name}`);
    handler(data).catch((err) => console.error(`[queue] ${name} failed`, err));
  }, opts.delayMs ?? 0);
}

export function startWorker() {
  const conn = getConnection();
  if (!conn) {
    console.log("[queue] REDIS_URL not set - running jobs in-process");
    return null;
  }
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers[job.name as JobName];
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      await handler(job.data);
    },
    { connection: conn as ConnectionOptions, concurrency: 5 },
  );
  worker.on("failed", (job, err) => console.error(`[queue] job ${job?.name} failed:`, err.message));
  console.log("[queue] BullMQ worker started");
  return worker;
}
