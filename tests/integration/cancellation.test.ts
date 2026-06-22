import assert from "node:assert/strict";
import test from "node:test";
import { Queue } from "bullmq";

import { buildApp, createDependencies, loadConfig } from "@redner/api";
import { createDatabaseClient } from "@redner/database";
import {
  createBullConnectionOptions,
  DEPLOYMENT_QUEUE_NAME,
  type DeploymentJobData,
} from "@redner/queue";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://redner:redner@localhost:5432/redner?schema=public";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

test("queued deployment cancellation removes its BullMQ job and records history", async () => {
  const dependencies = createDependencies(loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
  }));
  const app = buildApp({ dependencies, logger: false });
  const database = createDatabaseClient(databaseUrl);
  const queue = new Queue<DeploymentJobData>(DEPLOYMENT_QUEUE_NAME, {
    connection: createBullConnectionOptions(redisUrl),
  });
  let projectId: string | undefined;
  let deploymentId: string | undefined;

  try {
    const project = await database.project.create({
      data: {
        name: "Cancellation Test",
        slug: `cancel-${Date.now()}`,
        repoUrl: "https://github.com/example/app.git",
        branch: "main",
        appPort: 3000,
      },
    });
    projectId = project.id;
    const deployed = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/deploy`,
    });
    assert.equal(deployed.statusCode, 202);
    deploymentId = deployed.json().deployment.id as string;

    const cancelled = await app.inject({
      method: "POST",
      url: `/deployments/${deploymentId}/cancel`,
    });
    assert.equal(cancelled.statusCode, 202);
    assert.equal(cancelled.json().status, "cancelled");
    assert.equal(await queue.getJob(deploymentId), undefined);

    const stored = await database.deployment.findUniqueOrThrow({
      where: { id: deploymentId },
      include: { logs: { orderBy: { sequence: "asc" } } },
    });
    assert.equal(stored.status, "cancelled");
    assert.deepEqual(
      stored.logs.map((entry) => entry.message),
      ["Deployment queued", "Cancellation requested", "Deployment cancelled"],
    );
  } finally {
    if (deploymentId) await queue.getJob(deploymentId).then((job) => job?.remove()).catch(() => undefined);
    await queue.close();
    await app.close();
    if (projectId) await database.project.deleteMany({ where: { id: projectId } });
    await database.$disconnect();
  }
});
