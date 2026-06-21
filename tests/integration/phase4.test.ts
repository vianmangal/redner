import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  createDependencies,
  loadConfig,
  PrismaDeploymentStore,
} from "@redner/api";
import { createDatabaseClient } from "@redner/database";
import { createRedisConnection } from "@redner/queue";
import {
  createWorkerRuntime,
  loadWorkerConfig,
  RedisProjectLockManager,
} from "@redner/worker";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://redner:redner@localhost:5432/redner?schema=public";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

test("deploy API queues one job and the worker loads its snapshot", async (context) => {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
  });
  const dependencies = createDependencies(config);
  const app = buildApp({ dependencies, logger: false });
  const worker = createWorkerRuntime(
    loadWorkerConfig({
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      WORKER_CONCURRENCY: "1",
      DEPLOYMENT_LOCK_TTL_MS: "30000",
    }),
  );
  const database = createDatabaseClient(databaseUrl);
  const slug = `phase-four-${Date.now()}`;
  let projectId: string | undefined;

  context.after(async () => {
    await worker.close();
    if (projectId !== undefined) {
      await database.project.deleteMany({ where: { id: projectId } });
    }
    await database.$disconnect();
    await app.close();
  });

  const created = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "Phase Four Test",
      slug,
      repoUrl: "https://github.com/example/redner-test.git",
      branch: "main",
      appPort: 3000,
    },
  });
  assert.equal(created.statusCode, 201);
  projectId = created.json().project.id;

  const queued = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/deploy`,
  });
  assert.equal(queued.statusCode, 202);
  const deploymentId = queued.json().deployment.id as string;

  const duplicate = await app.inject({
    method: "POST",
    url: `/projects/${projectId}/deploy`,
  });
  assert.equal(duplicate.statusCode, 409);

  const stored = await waitForWorkerLogs(database, deploymentId);
  assert.equal(stored.snapshotSlug, slug);
  assert.equal(stored.snapshotBranch, "main");
  assert.deepEqual(
    stored.logs.map((entry) => entry.sequence),
    [1, 2, 3, 4],
  );
  assert.match(stored.logs[1]?.message ?? "", /Worker accepted/);
  assert.match(stored.logs[2]?.message ?? "", /loaded.*PostgreSQL/);

  const listed = await app.inject({
    method: "GET",
    url: `/projects/${projectId}/deployments`,
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().deployments[0].id, deploymentId);
});

test("database guard allows only one concurrent active deployment", async () => {
  const database = createDatabaseClient(databaseUrl);
  const deployments = new PrismaDeploymentStore(database);
  const slug = `phase-four-race-${Date.now()}`;

  try {
    const project = await database.project.create({
      data: {
        name: "Phase Four Race Test",
        slug,
        repoUrl: "https://github.com/example/redner-test.git",
        branch: "main",
        appPort: 3000,
      },
    });

    const results = await Promise.all([
      deployments.createQueued(project.id),
      deployments.createQueued(project.id),
    ]);

    assert.deepEqual(
      results.map((result) => result.kind).sort(),
      ["conflict", "created"],
    );
    assert.equal(
      await database.deployment.count({ where: { projectId: project.id } }),
      1,
    );
  } finally {
    await database.project.deleteMany({ where: { slug } });
    await database.$disconnect();
  }
});

test("Redis project lock excludes concurrent workers and releases by token", async () => {
  const redis = createRedisConnection(redisUrl, "worker");
  const locks = new RedisProjectLockManager(redis, 5_000);
  const projectId = `lock-test-${Date.now()}`;

  try {
    const first = await locks.acquire(projectId);
    assert.notEqual(first, null);
    assert.equal(await locks.acquire(projectId), null);

    await first?.release();
    const afterRelease = await locks.acquire(projectId);
    assert.notEqual(afterRelease, null);
    await afterRelease?.release();
  } finally {
    if (redis.status !== "end") {
      redis.disconnect();
    }
  }
});

async function waitForWorkerLogs(
  database: ReturnType<typeof createDatabaseClient>,
  deploymentId: string,
) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const deployment = await database.deployment.findUniqueOrThrow({
      where: { id: deploymentId },
      include: { logs: { orderBy: { sequence: "asc" } } },
    });
    if (deployment.logs.length >= 4) {
      return deployment;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Worker did not persist the expected logs within 5 seconds");
}
