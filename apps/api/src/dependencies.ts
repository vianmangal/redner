import {
  checkDatabase,
  createDatabaseClient,
  type DatabaseClient,
} from "@redner/database";
import {
  BullDeploymentQueue,
  BullProjectActionQueue,
  createRedisConnection,
  type DeploymentQueue,
  type ProjectActionQueue,
} from "@redner/queue";

import type { ApiConfig } from "./config.js";
import {
  PrismaDeploymentStore,
  type DeploymentStore,
} from "./deployments/store.js";
import { PrismaProjectStore, type ProjectStore } from "./projects/store.js";

export type DependencyName = "database" | "redis";
export type DependencyCheck = () => Promise<void>;

export interface AppDependencies {
  checks: Record<DependencyName, DependencyCheck>;
  projects: ProjectStore;
  deployments: DeploymentStore;
  deploymentQueue: DeploymentQueue;
  projectActionQueue: ProjectActionQueue;
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

  return {
    checks: {
      database: () => checkDatabase(database),
      redis: () => checkRedis(redis),
    },
    projects: new PrismaProjectStore(database),
    deployments: new PrismaDeploymentStore(database),
    deploymentQueue,
    projectActionQueue,
    close: async () => {
      await deploymentQueue.close();
      await projectActionQueue.close();
      await database.$disconnect();

      if (redis.status !== "end") {
        redis.disconnect();
      }
    },
  };
}
