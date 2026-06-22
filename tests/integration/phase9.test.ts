import assert from "node:assert/strict";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabaseClient } from "@redner/database";
import {
  PrismaWorkerDeploymentStore,
  runProcess,
  WorkerReconciler,
} from "@redner/worker";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://redner:redner@localhost:5432/redner?schema=public";

test("startup reconciliation preserves active resources and removes abandoned ones", async () => {
  const database = createDatabaseClient(databaseUrl);
  const deployments = new PrismaWorkerDeploymentStore(database);
  const stamp = Date.now();
  const activeName = `redner-phase9-active-${stamp}`;
  const orphanName = `redner-phase9-orphan-${stamp}`;
  const orphanImage = `redner-phase9-orphan:${stamp}`;
  const activeSlug = `phase-nine-active-${stamp}`;
  const staleSlug = `phase-nine-stale-${stamp}`;
  const routesDir = join(process.cwd(), "data/caddy/routes");
  const buildRoot = join(tmpdir(), `redner-phase9-builds-${stamp}`);
  const projectIds: string[] = [];
  let activeContainerId: string | undefined;
  let orphanContainerId: string | undefined;

  try {
    const activeProject = await database.project.create({
      data: {
        name: "Active Recovery",
        slug: activeSlug,
        repoUrl: "https://github.com/example/active.git",
        branch: "main",
        appPort: 80,
        status: "unhealthy",
      },
    });
    projectIds.push(activeProject.id);
    const activeDeployment = await database.deployment.create({
      data: {
        projectId: activeProject.id,
        status: "succeeded",
        snapshotRepoUrl: activeProject.repoUrl,
        snapshotBranch: activeProject.branch,
        snapshotSlug: activeProject.slug,
        snapshotAppPort: activeProject.appPort,
        imageName: "caddy:2-alpine",
        finishedAt: new Date(),
      },
    });
    const active = await runProcess(
      "docker",
      [
        "run", "--detach", "--name", activeName,
        "--label", "redner.managed=true",
        "--label", `redner.project-id=${activeProject.id}`,
        "--label", `redner.deployment-id=${activeDeployment.id}`,
        "--network", "redner_proxy",
        "--entrypoint", "sh", "caddy:2-alpine", "-c",
        "exec caddy file-server --listen :80",
      ],
      options(),
    );
    activeContainerId = active.stdout.trim();
    await database.deployment.update({
      where: { id: activeDeployment.id },
      data: { containerId: activeContainerId },
    });
    await database.project.update({
      where: { id: activeProject.id },
      data: { activeDeploymentId: activeDeployment.id },
    });

    const abandonedProject = await database.project.create({
      data: {
        name: "Abandoned Build",
        slug: `phase-nine-abandoned-${stamp}`,
        repoUrl: "https://github.com/example/abandoned.git",
        branch: "main",
        appPort: 3000,
      },
    });
    projectIds.push(abandonedProject.id);
    const abandoned = await database.deployment.create({
      data: {
        projectId: abandonedProject.id,
        status: "building",
        snapshotRepoUrl: abandonedProject.repoUrl,
        snapshotBranch: abandonedProject.branch,
        snapshotSlug: abandonedProject.slug,
        snapshotAppPort: abandonedProject.appPort,
        imageName: orphanImage,
      },
    });
    await runProcess(
      "docker",
      ["image", "tag", "caddy:2-alpine", orphanImage],
      options(),
    );
    const orphan = await runProcess(
      "docker",
      [
        "run", "--detach", "--name", orphanName,
        "--label", "redner.managed=true",
        "--label", `redner.project-id=${abandonedProject.id}`,
        "--label", `redner.deployment-id=${abandoned.id}`,
        "--entrypoint", "sh", orphanImage, "-c", "exec sleep 60",
      ],
      options(),
    );
    orphanContainerId = orphan.stdout.trim();

    const lostProject = await database.project.create({
      data: {
        name: "Lost Queue",
        slug: `phase-nine-lost-${stamp}`,
        repoUrl: "https://github.com/example/lost.git",
        branch: "main",
        appPort: 3000,
      },
    });
    projectIds.push(lostProject.id);
    const lost = await database.deployment.create({
      data: {
        projectId: lostProject.id,
        status: "queued",
        snapshotRepoUrl: lostProject.repoUrl,
        snapshotBranch: lostProject.branch,
        snapshotSlug: lostProject.slug,
        snapshotAppPort: lostProject.appPort,
      },
    });

    await mkdir(join(buildRoot, `${abandoned.id}-temporary`), { recursive: true });
    await writeFile(
      join(routesDir, `${activeSlug}.caddy`),
      `http://${activeSlug}.localhost {\n  reverse_proxy ${activeName}:80\n}\n`,
    );
    await writeFile(
      join(routesDir, `${staleSlug}.caddy`),
      `http://${staleSlug}.localhost {\n  respond "stale" 200\n}\n`,
    );

    const reconciler = new WorkerReconciler(
      database,
      deployments,
      { hasJob: async () => false },
      { buildRoot, caddyContainer: "redner-caddy", caddyRoutesDir: routesDir },
    );
    const first = await reconciler.reconcile();
    const second = await reconciler.reconcile();

    assert.equal(first.abandonedDeployments, 2);
    assert.equal(first.removedContainers, 1);
    assert.equal(first.removedImages, 1);
    assert.equal(first.removedTemporaryDirectories, 1);
    assert.equal(first.removedRoutes, 1);
    assert.equal(first.recoveredProjects, 1);
    assert.deepEqual(second, {
      abandonedDeployments: 0,
      removedContainers: 0,
      removedImages: 0,
      removedTemporaryDirectories: 0,
      removedRoutes: 0,
      recoveredProjects: 0,
    });

    await runProcess("docker", ["stop", activeContainerId], options());
    const afterDockerStops = await reconciler.reconcile();
    assert.equal(afterDockerStops.recoveredProjects, 1);
    assert.equal(
      (await database.project.findUniqueOrThrow({ where: { id: activeProject.id } })).status,
      "unhealthy",
    );

    await runProcess("docker", ["start", activeContainerId], options());
    const afterDockerReturns = await reconciler.reconcile();
    assert.equal(afterDockerReturns.recoveredProjects, 1);

    assert.equal(
      (await database.project.findUniqueOrThrow({ where: { id: activeProject.id } })).status,
      "running",
    );
    assert.equal(
      (await database.deployment.findUniqueOrThrow({ where: { id: abandoned.id } })).status,
      "failed",
    );
    const lostStored = await database.deployment.findUniqueOrThrow({
      where: { id: lost.id },
    });
    assert.equal(lostStored.status, "failed");
    assert.match(lostStored.failureReason ?? "", /queue entry was lost/);
    await runProcess("docker", ["inspect", activeContainerId], options());
    await assert.rejects(runProcess("docker", ["inspect", orphanContainerId], options()));
    await runProcess("docker", ["image", "inspect", "caddy:2-alpine"], options());
    await assert.rejects(runProcess("docker", ["image", "inspect", orphanImage], options()));
    await assert.rejects(access(join(buildRoot, `${abandoned.id}-temporary`)));
    await assert.rejects(access(join(routesDir, `${staleSlug}.caddy`)));
  } finally {
    if (activeContainerId) {
      await runProcess("docker", ["rm", "--force", activeContainerId], options()).catch(() => undefined);
    }
    if (orphanContainerId) {
      await runProcess("docker", ["rm", "--force", orphanContainerId], options()).catch(() => undefined);
    }
    await runProcess("docker", ["image", "rm", "--force", orphanImage], options()).catch(() => undefined);
    await rm(join(routesDir, `${activeSlug}.caddy`), { force: true });
    await rm(join(routesDir, `${staleSlug}.caddy`), { force: true });
    await runProcess(
      "docker",
      ["exec", "redner-caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile"],
      options(),
    ).catch(() => undefined);
    await rm(buildRoot, { recursive: true, force: true });
    if (projectIds.length > 0) {
      await database.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await database.$disconnect();
  }
});

function options() {
  return { timeoutMs: 120_000, maxLines: 500, maxLineLength: 2_000 };
}
