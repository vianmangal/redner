import { Worker } from "bullmq";

import { createDatabaseClient } from "@redner/database";
import {
  BullDeploymentQueue,
  createBullConnectionOptions,
  createRedisConnection,
  DEPLOYMENT_QUEUE_NAME,
  PROJECT_ACTION_QUEUE_NAME,
  RedisDeploymentCancellationSubscriber,
  RedisDeploymentLogPublisher,
  type DeploymentJobData,
  type ProjectActionJobData,
} from "@redner/queue";

import type { WorkerConfig } from "./config.js";
import { CloneBuildExecutor } from "./clone-build.js";
import { DockerContainerLifecycle } from "./container-lifecycle.js";
import { PrismaWorkerDeploymentStore } from "./deployment-store.js";
import { createDeploymentProcessor } from "./processor.js";
import { RedisProjectLockManager } from "./project-lock.js";
import { createProjectActionProcessor } from "./project-actions.js";
import { DockerRuntimeLogCollector } from "./runtime-logs.js";
import { LocalDeploymentCancellationManager } from "./deployment-cancellation.js";
import { WorkerReconciler } from "./reconciler.js";

export interface WorkerRuntime {
  close(): Promise<void>;
}

export async function createWorkerRuntime(
  config: WorkerConfig,
): Promise<WorkerRuntime> {
  const database = createDatabaseClient(config.DATABASE_URL);
  const lockConnection = createRedisConnection(config.REDIS_URL, "worker");
  const logPublisher = new RedisDeploymentLogPublisher(config.REDIS_URL);
  const deployments = new PrismaWorkerDeploymentStore(
    database,
    logPublisher,
    config.MAX_RETAINED_LOG_LINES,
    config.MAX_LOG_LINE_LENGTH,
  );
  const runtimeLogs = new DockerRuntimeLogCollector(
    deployments,
    config.MAX_LOG_LINE_LENGTH,
  );
  const recoveryQueue = new BullDeploymentQueue(config.REDIS_URL);
  try {
    await new WorkerReconciler(
      database,
      deployments,
      recoveryQueue,
      {
        buildRoot: config.REDNER_BUILD_ROOT,
        caddyContainer: config.REDNER_CADDY_CONTAINER,
        caddyRoutesDir: config.REDNER_CADDY_ROUTES_DIR,
      },
      undefined,
      runtimeLogs,
    ).reconcile();
  } finally {
    await recoveryQueue.close();
  }
  const cancellationSubscriber = new RedisDeploymentCancellationSubscriber(
    config.REDIS_URL,
  );
  const cancellations = new LocalDeploymentCancellationManager();
  const cancellationSubscription = cancellationSubscriber
    .subscribe((deploymentId) => cancellations.cancel(deploymentId))
    .catch((error) => {
      console.error("deployment cancellation subscriber error", error);
      return undefined;
    });
  const containers = new DockerContainerLifecycle(deployments, {
    proxyNetwork: config.REDNER_PROXY_NETWORK,
    caddyContainer: config.REDNER_CADDY_CONTAINER,
    caddyRoutesDir: config.REDNER_CADDY_ROUTES_DIR,
    healthTimeoutMs: config.HEALTH_TIMEOUT_MS,
    memoryLimit: config.CONTAINER_MEMORY_LIMIT,
    cpuLimit: config.CONTAINER_CPU_LIMIT,
    pidsLimit: config.CONTAINER_PIDS_LIMIT,
  }, undefined, runtimeLogs);
  const executor = new CloneBuildExecutor(deployments, {
    buildRoot: config.REDNER_BUILD_ROOT,
    cloneTimeoutMs: config.CLONE_TIMEOUT_MS,
    buildTimeoutMs: config.BUILD_TIMEOUT_MS,
    maxLogLines: config.MAX_BUILD_LOG_LINES,
    maxLogLineLength: config.MAX_LOG_LINE_LENGTH,
  }, undefined, containers);
  const locks = new RedisProjectLockManager(
    lockConnection,
    config.DEPLOYMENT_LOCK_TTL_MS,
  );
  const worker = new Worker<DeploymentJobData>(
    DEPLOYMENT_QUEUE_NAME,
    createDeploymentProcessor(deployments, locks, executor, cancellations),
    {
      connection: createBullConnectionOptions(config.REDIS_URL, "worker"),
      concurrency: config.WORKER_CONCURRENCY,
    },
  );
  const actionWorker = new Worker<ProjectActionJobData>(
    PROJECT_ACTION_QUEUE_NAME,
    createProjectActionProcessor(database, deployments, locks, containers),
    { connection: createBullConnectionOptions(config.REDIS_URL, "worker"), concurrency: config.WORKER_CONCURRENCY },
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
  actionWorker.on("failed", (job, error) => {
    console.error(
      `project action job ${job?.id ?? "unknown"} failed: ${error.message}`,
    );
  });
  actionWorker.on("error", (error) => {
    console.error("project action worker error", error);
  });

  return {
    close: async () => {
      cancellations.cancelAll();
      await worker.close();
      await actionWorker.close();
      const unsubscribeCancellation = await cancellationSubscription;
      await unsubscribeCancellation?.();
      await cancellationSubscriber.close();
      await runtimeLogs.close();
      await logPublisher.close();
      if (lockConnection.status !== "end") {
        lockConnection.disconnect();
      }
      await database.$disconnect();
    },
  };
}
