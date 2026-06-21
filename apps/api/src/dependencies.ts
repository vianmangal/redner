import {
  checkDatabase,
  createDatabaseClient,
  type DatabaseClient,
} from "@redner/database";
import { Redis } from "ioredis";

import type { ApiConfig } from "./config.js";
import { PrismaProjectStore, type ProjectStore } from "./projects/store.js";

export type DependencyName = "database" | "redis";
export type DependencyCheck = () => Promise<void>;

export interface AppDependencies {
  checks: Record<DependencyName, DependencyCheck>;
  projects: ProjectStore;
  close: () => Promise<void>;
}

async function checkRedis(redis: Redis): Promise<void> {
  if (redis.status === "wait") {
    await redis.connect();
  }

  await redis.ping();
}

export function createDependencies(config: ApiConfig): AppDependencies {
  const database: DatabaseClient = createDatabaseClient(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    enableOfflineQueue: false,
  });

  redis.on("error", () => {
    // Health responses report connection errors; avoid an unhandled error event.
  });

  return {
    checks: {
      database: () => checkDatabase(database),
      redis: () => checkRedis(redis),
    },
    projects: new PrismaProjectStore(database),
    close: async () => {
      await database.$disconnect();

      if (redis.status !== "end") {
        redis.disconnect();
      }
    },
  };
}
