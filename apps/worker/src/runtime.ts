import { Worker } from "bullmq";

import { createDatabaseClient } from "@redner/database";
import {
  createBullConnectionOptions,
  createRedisConnection,
  DEPLOYMENT_QUEUE_NAME,
  type DeploymentJobData,
} from "@redner/queue";

import type { WorkerConfig } from "./config.js";
import { PrismaWorkerDeploymentStore } from "./deployment-store.js";
import { createDeploymentProcessor } from "./processor.js";
import { RedisProjectLockManager } from "./project-lock.js";

export interface WorkerRuntime {
  close(): Promise<void>;
}

export function createWorkerRuntime(config: WorkerConfig): WorkerRuntime {
  const database = createDatabaseClient(config.DATABASE_URL);
  const lockConnection = createRedisConnection(config.REDIS_URL, "worker");
  const deployments = new PrismaWorkerDeploymentStore(database);
  const locks = new RedisProjectLockManager(
    lockConnection,
    config.DEPLOYMENT_LOCK_TTL_MS,
  );
  const worker = new Worker<DeploymentJobData>(
    DEPLOYMENT_QUEUE_NAME,
    createDeploymentProcessor(deployments, locks),
    {
      connection: createBullConnectionOptions(config.REDIS_URL, "worker"),
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    console.log(`deployment job ${job.id ?? "unknown"} processed`);
  });
  worker.on("failed", (job, error) => {
    console.error(
      `deployment job ${job?.id ?? "unknown"} failed: ${error.message}`,
    );
  });
  worker.on("error", (error) => {
    console.error("deployment worker error", error);
  });

  return {
    close: async () => {
      await worker.close();
      if (lockConnection.status !== "end") {
        lockConnection.disconnect();
      }
      await database.$disconnect();
    },
  };
}
