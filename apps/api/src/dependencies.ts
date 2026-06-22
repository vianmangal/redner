import {
  checkDatabase,
  createDatabaseClient,
  type DatabaseClient,
} from "@redner/database";
import {
  BullDeploymentQueue,
  BullProjectActionQueue,
  createRedisConnection,
  RedisDeploymentLogSubscriber,
  RedisDeploymentLogPublisher,
  RedisDeploymentCancellationPublisher,
  type DeploymentLogSubscriber,
  type DeploymentCancellationPublisher,
  type DeploymentQueue,
  type ProjectActionQueue,
} from "@redner/queue";

import type { ApiConfig } from "./config.js";
import {
  PrismaDeploymentStore,
  type DeploymentStore,
} from "./deployments/store.js";
import { PrismaProjectStore, type ProjectStore } from "./projects/store.js";
import { PrismaDeploymentLogStore, type DeploymentLogStore } from "./logs/store.js";

export type DependencyName = "database" | "redis";
export type DependencyCheck = () => Promise<void>;

export interface AppDependencies {
  checks: Record<DependencyName, DependencyCheck>;
  projects: ProjectStore;
  deployments: DeploymentStore;
  deploymentQueue: DeploymentQueue;
  projectActionQueue: ProjectActionQueue;
  logs: DeploymentLogStore;
  logSubscriber: DeploymentLogSubscriber;
  cancellationPublisher: DeploymentCancellationPublisher;
  close: () => Promise<void>;
}

async function checkRedis(
  redis: ReturnType<typeof createRedisConnection>,
): Promise<void> {
  if (redis.status === "wait") {
    await redis.connect();
  }

  await redis.ping();
}

export function createDependencies(config: ApiConfig): AppDependencies {
  const database: DatabaseClient = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisConnection(config.REDIS_URL);
  const deploymentQueue = new BullDeploymentQueue(config.REDIS_URL);
  const projectActionQueue = new BullProjectActionQueue(config.REDIS_URL);
  const logSubscriber = new RedisDeploymentLogSubscriber(config.REDIS_URL);
  const logPublisher = new RedisDeploymentLogPublisher(config.REDIS_URL);
  const cancellationPublisher = new RedisDeploymentCancellationPublisher(
    config.REDIS_URL,
  );

  return {
    checks: {
      database: () => checkDatabase(database),
      redis: () => checkRedis(redis),
    },
    projects: new PrismaProjectStore(database),
    deployments: new PrismaDeploymentStore(database, logPublisher),
    deploymentQueue,
    projectActionQueue,
    logs: new PrismaDeploymentLogStore(database),
    logSubscriber,
    cancellationPublisher,
    close: async () => {
      await deploymentQueue.close();
      await projectActionQueue.close();
      await logSubscriber.close();
      await logPublisher.close();
      await cancellationPublisher.close();
      await database.$disconnect();

      if (redis.status !== "end") {
        redis.disconnect();
      }
    },
  };
}
