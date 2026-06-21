import { randomUUID } from "node:crypto";

import { deploymentLockKey } from "@redner/queue";
import type { Redis } from "ioredis";

export interface AcquiredProjectLock {
  release(): Promise<void>;
}

export interface ProjectLockManager {
  acquire(projectId: string): Promise<AcquiredProjectLock | null>;
}

const releaseScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export class RedisProjectLockManager implements ProjectLockManager {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number,
  ) {}

  async acquire(projectId: string): Promise<AcquiredProjectLock | null> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }

    const key = deploymentLockKey(projectId);
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, "PX", this.ttlMs, "NX");
    if (acquired !== "OK") {
      return null;
    }

    return {
      release: async () => {
        await this.redis.eval(releaseScript, 1, key, token);
      },
    };
  }
}
