import assert from "node:assert/strict";
import test from "node:test";

import { buildApp, createDependencies, loadConfig } from "@redner/api";
import { createDatabaseClient } from "@redner/database";
import { RedisDeploymentLogPublisher } from "@redner/queue";
import {
  DockerRuntimeLogCollector,
  PrismaWorkerDeploymentStore,
  runProcess,
} from "@redner/worker";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://redner:redner@localhost:5432/redner?schema=public";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

test("logs persist with retention, stream over SSE, and include Docker runtime output", async () => {
  const database = createDatabaseClient(databaseUrl);
  const publisher = new RedisDeploymentLogPublisher(redisUrl);
  const store = new PrismaWorkerDeploymentStore(database, publisher, 3, 80);
  const collector = new DockerRuntimeLogCollector(store, 80);
  const dependencies = createDependencies(loadConfig({ DATABASE_URL: databaseUrl, REDIS_URL: redisUrl }));
  const app = buildApp({ dependencies, logger: false });
  const containerName = `redner-phase7-${Date.now()}`;
  let projectId: string | undefined;
  let deploymentId: string | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = new AbortController();
  const reconnectAbort = new AbortController();

  try {
    const project = await database.project.create({
      data: {
        name: "Phase Seven",
        slug: `phase-seven-${Date.now()}`,
        repoUrl: "https://github.com/example/app.git",
        branch: "main",
        appPort: 8080,
      },
    });
    projectId = project.id;
    const deployment = await database.deployment.create({
      data: {
        projectId,
        snapshotRepoUrl: project.repoUrl,
        snapshotBranch: project.branch,
        snapshotSlug: project.slug,
        snapshotAppPort: project.appPort,
      },
    });
    deploymentId = deployment.id;

    for (const message of ["one", "two", "three", "four"]) {
      await store.appendSystemLog(deployment.id, message);
    }
    const retained = await database.log.findMany({
      where: { deploymentId: deployment.id },
      orderBy: { sequence: "asc" },
    });
    assert.deepEqual(retained.map((entry) => entry.sequence), [2, 3, 4]);

    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const response = await fetch(
      `${address}/deployments/${deployment.id}/logs/stream`,
      { signal: abort.signal },
    );
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.ok(response.body);
    reader = response.body.getReader();
    const backlog = await readUntil(reader, '"message":"four"');
    assert.match(backlog, /id: 4/);

    await store.appendBuildLog(deployment.id, "live-event");
    const live = await readUntil(reader, '"message":"live-event"');
    assert.match(live, /event: log/);

    abort.abort();
    await reader.cancel().catch(() => undefined);
    reader = undefined;
    const resumedResponse = await fetch(
      `${address}/deployments/${deployment.id}/logs/stream`,
      {
        headers: { "Last-Event-ID": "4" },
        signal: reconnectAbort.signal,
      },
    );
    assert.ok(resumedResponse.body);
    const resumedReader = resumedResponse.body.getReader();
    const resumed = await readUntil(resumedReader, '"message":"live-event"');
    assert.match(resumed, /id: 5/);
    reconnectAbort.abort();
    await resumedReader.cancel().catch(() => undefined);

    await runProcess(
      "docker",
      [
        "run", "--detach", "--name", containerName,
        "--entrypoint", "sh", "caddy:2-alpine", "-c",
        "echo runtime-phase7; exec sleep 30",
      ],
      options(),
    );
    const inspected = await runProcess(
      "docker",
      ["inspect", "--format", "{{.Id}}", containerName],
      options(),
    );
    await collector.start(
      deployment.id,
      inspected.stdout.trim(),
      new Date(Date.now() - 1_000),
    );
    await waitForRuntimeLog(database, deployment.id);
  } finally {
    abort.abort();
    reconnectAbort.abort();
    await reader?.cancel().catch(() => undefined);
    await collector.close();
    await runProcess("docker", ["rm", "--force", containerName], options()).catch(() => undefined);
    await app.close();
    await publisher.close();
    if (projectId) await database.project.deleteMany({ where: { id: projectId } });
    await database.$disconnect();
  }
});

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + 5_000;
  while (!output.includes(expected)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${expected}`);
    const result = await readWithTimeout(reader, expected);
    if (result.done) throw new Error("SSE stream ended unexpectedly");
    output += decoder.decode(result.value, { stream: true });
  }
  return output;
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${expected}`)),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function waitForRuntimeLog(
  database: ReturnType<typeof createDatabaseClient>,
  deploymentId: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const entry = await database.log.findFirst({
      where: { deploymentId, type: "runtime", message: "runtime-phase7" },
    });
    if (entry !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Runtime log was not persisted");
}

function options() {
  return { timeoutMs: 60_000, maxLines: 200, maxLineLength: 2_000 };
}
