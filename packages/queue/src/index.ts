import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

import type { DeploymentLog, WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "queue",
  kind: "package",
};

export const DEPLOYMENT_QUEUE_NAME = "redner-deployments";
export const DEPLOYMENT_JOB_NAME = "deploy";
export const PROJECT_ACTION_QUEUE_NAME = "redner-project-actions";
const DEPLOYMENT_LOG_CHANNEL_PREFIX = "redner:deployment-logs:";
const DEPLOYMENT_CANCELLATION_CHANNEL = "redner:deployment-cancellations";

export interface DeploymentJobData {
  deploymentId: string;
}

export interface DeploymentQueue {
  enqueue(deploymentId: string): Promise<void>;
  cancelWaiting(deploymentId: string): Promise<boolean>;
  hasJob(deploymentId: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface DeploymentCancellationPublisher {
  publish(deploymentId: string): Promise<void>;
  close(): Promise<void>;
}

export type DeploymentCancellationListener = (deploymentId: string) => void;

export interface DeploymentCancellationSubscriber {
  subscribe(listener: DeploymentCancellationListener): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export type ProjectAction = "stop" | "restart" | "delete";
export interface ProjectActionJobData {
  projectId: string;
  action: ProjectAction;
}
export interface ProjectActionQueue {
  enqueue(projectId: string, action: ProjectAction): Promise<void>;
  close(): Promise<void>;
}

export interface DeploymentLogPublisher {
  publish(log: DeploymentLog): Promise<void>;
  close(): Promise<void>;
}

export type DeploymentLogListener = (log: DeploymentLog) => void;

export interface DeploymentLogSubscriber {
  subscribe(
    deploymentId: string,
    listener: DeploymentLogListener,
  ): Promise<() => Promise<void>>;
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

export function deploymentLogChannel(deploymentId: string): string {
  return `${DEPLOYMENT_LOG_CHANNEL_PREFIX}${deploymentId}`;
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

  async cancelWaiting(deploymentId: string): Promise<boolean> {
    const job = await this.queue.getJob(deploymentId);
    if (job === undefined) return false;
    const state = await job.getState();
    if (!["waiting", "delayed", "prioritized", "waiting-children"].includes(state)) {
      return false;
    }
    await job.remove();
    return true;
  }

  async hasJob(deploymentId: string): Promise<boolean> {
    const job = await this.queue.getJob(deploymentId);
    if (job === undefined) return false;
    const state = await job.getState();
    return [
      "active",
      "waiting",
      "delayed",
      "prioritized",
      "waiting-children",
    ].includes(state);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullProjectActionQueue implements ProjectActionQueue {
  private readonly queue: Queue<ProjectActionJobData>;

  constructor(redisUrl: string) {
    this.queue = new Queue(PROJECT_ACTION_QUEUE_NAME, {
      connection: createBullConnectionOptions(redisUrl),
      defaultJobOptions: deploymentJobOptions,
    });
    this.queue.on("error", () => {
      // enqueue() reports producer failures to the API request.
    });
  }

  async enqueue(projectId: string, action: ProjectAction): Promise<void> {
    await this.queue.add(action, { projectId, action });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class RedisDeploymentLogPublisher implements DeploymentLogPublisher {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = createRedisConnection(redisUrl, "worker");
  }

  async publish(log: DeploymentLog): Promise<void> {
    await this.redis.publish(
      deploymentLogChannel(log.deploymentId),
      JSON.stringify(log),
    );
  }

  async close(): Promise<void> {
    if (this.redis.status !== "end") this.redis.disconnect();
  }
}

export class RedisDeploymentLogSubscriber implements DeploymentLogSubscriber {
  private readonly redis: Redis;
  private readonly listeners = new Map<string, Set<DeploymentLogListener>>();

  constructor(redisUrl: string) {
    this.redis = createRedisConnection(redisUrl, "worker");
    this.redis.on("message", (channel, message) => {
      const listeners = this.listeners.get(channel);
      if (listeners === undefined) return;

      try {
        const log = JSON.parse(message) as DeploymentLog;
        for (const listener of listeners) listener(log);
      } catch {
        // Ignore malformed messages; stored PostgreSQL logs remain authoritative.
      }
    });
  }

  async subscribe(
    deploymentId: string,
    listener: DeploymentLogListener,
  ): Promise<() => Promise<void>> {
    const channel = deploymentLogChannel(deploymentId);
    let listeners = this.listeners.get(channel);
    if (listeners === undefined) {
      listeners = new Set();
      this.listeners.set(channel, listeners);
      try {
        await this.redis.subscribe(channel);
      } catch (error) {
        this.listeners.delete(channel);
        throw error;
      }
    }
    listeners.add(listener);

    return async () => {
      const current = this.listeners.get(channel);
      current?.delete(listener);
      if (current !== undefined && current.size === 0) {
        this.listeners.delete(channel);
        if (this.redis.status !== "end") await this.redis.unsubscribe(channel);
      }
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    if (this.redis.status !== "end") this.redis.disconnect();
  }
}

export class RedisDeploymentCancellationPublisher
  implements DeploymentCancellationPublisher
{
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = createRedisConnection(redisUrl, "worker");
  }

  async publish(deploymentId: string): Promise<void> {
    await this.redis.publish(DEPLOYMENT_CANCELLATION_CHANNEL, deploymentId);
  }

  async close(): Promise<void> {
    if (this.redis.status !== "end") this.redis.disconnect();
  }
}

export class RedisDeploymentCancellationSubscriber
  implements DeploymentCancellationSubscriber
{
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = createRedisConnection(redisUrl, "worker");
  }

  async subscribe(
    listener: DeploymentCancellationListener,
  ): Promise<() => Promise<void>> {
    const onMessage = (channel: string, deploymentId: string) => {
      if (channel === DEPLOYMENT_CANCELLATION_CHANNEL) listener(deploymentId);
    };
    this.redis.on("message", onMessage);
    try {
      await this.redis.subscribe(DEPLOYMENT_CANCELLATION_CHANNEL);
    } catch (error) {
      this.redis.off("message", onMessage);
      throw error;
    }

    return async () => {
      this.redis.off("message", onMessage);
      if (this.redis.status !== "end") {
        await this.redis.unsubscribe(DEPLOYMENT_CANCELLATION_CHANNEL);
      }
    };
  }

  async close(): Promise<void> {
    if (this.redis.status !== "end") this.redis.disconnect();
  }
}
