import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "queue",
  kind: "package",
};

export const DEPLOYMENT_QUEUE_NAME = "redner-deployments";
export const DEPLOYMENT_JOB_NAME = "deploy";

export interface DeploymentJobData {
  deploymentId: string;
}

export interface DeploymentQueue {
  enqueue(deploymentId: string): Promise<void>;
  close(): Promise<void>;
}

export const deploymentJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export function createRedisConnection(
  redisUrl: string,
  mode: "producer" | "worker" = "producer",
): Redis {
  const options: RedisOptions = {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: mode === "worker" ? null : 1,
    enableOfflineQueue: mode === "worker",
  };

  const redis = new Redis(redisUrl, options);
  redis.on("error", () => {
    // Callers surface connection failures through health checks or failed jobs.
  });
  return redis;
}

export function deploymentLockKey(projectId: string): string {
  return `redner:deployment-lock:${projectId}`;
}

export function createBullConnectionOptions(
  redisUrl: string,
  mode: "producer" | "worker" = "producer",
): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;

  return {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
    connectTimeout: 2_000,
    maxRetriesPerRequest: mode === "worker" ? null : 1,
    ...(mode === "producer"
      ? {
          enableOfflineQueue: false,
          retryStrategy: () => null,
        }
      : {}),
    ...(url.username !== "" ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password !== "" ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(database) && database > 0 ? { db: database } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export class BullDeploymentQueue implements DeploymentQueue {
  private readonly queue: Queue<
    DeploymentJobData,
    void,
    typeof DEPLOYMENT_JOB_NAME
  >;

  constructor(redisUrl: string) {
    this.queue = new Queue<
      DeploymentJobData,
      void,
      typeof DEPLOYMENT_JOB_NAME
    >(DEPLOYMENT_QUEUE_NAME, {
      connection: createBullConnectionOptions(redisUrl),
      defaultJobOptions: deploymentJobOptions,
    });
    this.queue.on("error", () => {
      // enqueue() reports producer failures to the API request.
    });
  }

  async enqueue(deploymentId: string): Promise<void> {
    await this.queue.add(
      DEPLOYMENT_JOB_NAME,
      { deploymentId },
      { jobId: deploymentId },
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
