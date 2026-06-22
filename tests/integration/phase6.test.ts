import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Job } from "bullmq";

import { createDatabaseClient } from "@redner/database";
import { createRedisConnection, type ProjectActionJobData } from "@redner/queue";
import { createProjectActionProcessor, DockerContainerLifecycle, PrismaWorkerDeploymentStore, RedisProjectLockManager, runProcess } from "@redner/worker";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://redner:redner@localhost:5432/redner?schema=public";

test("healthy candidate is routed and promoted through Caddy", async () => {
  const root = await mkdtemp(join(tmpdir(), "redner-phase6-"));
  const database = createDatabaseClient(databaseUrl);
  const slug = `phase-six-${Date.now()}`;
  let projectId: string | undefined;
  let containerId: string | undefined;
  let imageName: string | undefined;
  const redis = createRedisConnection("redis://localhost:6379", "worker");
  const routePath = join(process.cwd(), "data/caddy/routes", `${slug}.caddy`);

  try {
    await writeFile(join(root, "Dockerfile"), "FROM caddy:2-alpine\nCOPY AppCaddyfile /etc/caddy/Caddyfile\n");
    await writeFile(
      join(root, "AppCaddyfile"),
      ':80 {\n  respond "phase-six-ok" 200\n}\n',
    );
    imageName = `redner-phase6-test:${Date.now()}`;
    await runProcess("docker", ["build", "--tag", imageName, "."], { ...options(), cwd: root });

    const project = await database.project.create({
      data: { name: "Phase Six", slug, repoUrl: "https://github.com/example/app.git", branch: "main", appPort: 80 },
    });
    projectId = project.id;
    const deployment = await database.deployment.create({
      data: { projectId, status: "building", snapshotRepoUrl: project.repoUrl, snapshotBranch: "main", snapshotSlug: slug, snapshotAppPort: 80, imageName },
    });
    const store = new PrismaWorkerDeploymentStore(database);
    const lifecycle = new DockerContainerLifecycle(store, {
      proxyNetwork: "redner_proxy", caddyContainer: "redner-caddy",
      caddyRoutesDir: join(process.cwd(), "data/caddy/routes"), healthTimeoutMs: 20_000,
      memoryLimit: "128m", cpuLimit: "0.5", pidsLimit: 64,
    });
    await lifecycle.promote({ id: deployment.id, projectId, snapshotRepoUrl: project.repoUrl, snapshotBranch: "main", snapshotSlug: slug, snapshotAppPort: 80 }, imageName);

    const stored = await database.project.findUniqueOrThrow({ where: { id: projectId }, include: { activeDeployment: true } });
    containerId = stored.activeDeployment?.containerId ?? undefined;
    assert.equal(stored.status, "running");
    assert.equal(stored.activeDeployment?.status, "succeeded");
    const response = await runProcess("curl", ["--fail", "--silent", "--header", `Host: ${slug}.localhost`, "http://127.0.0.1"], options());
    assert.equal(response.stdout, "phase-six-ok");

    const actions = createProjectActionProcessor(
      database,
      store,
      new RedisProjectLockManager(redis, 60_000),
      lifecycle,
    );
    await actions({ data: { projectId, action: "stop" } } as Job<ProjectActionJobData>);
    assert.equal((await database.project.findUniqueOrThrow({ where: { id: projectId } })).status, "stopped");
    await actions({ data: { projectId, action: "restart" } } as Job<ProjectActionJobData>);
    assert.equal((await database.project.findUniqueOrThrow({ where: { id: projectId } })).status, "running");
  } finally {
    if (containerId) await runProcess("docker", ["rm", "--force", containerId], options()).catch(() => undefined);
    if (imageName) await runProcess("docker", ["image", "rm", "--force", imageName], options()).catch(() => undefined);
    await rm(routePath, { force: true });
    await runProcess("docker", ["exec", "redner-caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile"], options()).catch(() => undefined);
    if (projectId) await database.project.deleteMany({ where: { id: projectId } });
    await database.$disconnect();
    if (redis.status !== "end") redis.disconnect();
    await rm(root, { recursive: true, force: true });
  }
});

function options() { return { timeoutMs: 120_000, maxLines: 500, maxLineLength: 2_000 }; }
