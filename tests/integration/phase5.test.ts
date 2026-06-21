import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabaseClient } from "@redner/database";
import {
  CloneBuildExecutor,
  PrismaWorkerDeploymentStore,
  runProcess,
} from "@redner/worker";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://redner:redner@localhost:5432/redner?schema=public";

test("worker clones a repository and produces a tagged Docker image", async () => {
  const root = await mkdtemp(join(tmpdir(), "redner-phase5-integration-"));
  const repository = join(root, "repository");
  const buildRoot = join(root, "builds");
  const database = createDatabaseClient(databaseUrl);
  let projectId: string | undefined;
  let imageName: string | undefined;

  try {
    await mkdir(repository);
    await writeFile(join(repository, "Dockerfile"), "FROM scratch\nCOPY payload.txt /payload.txt\n");
    await writeFile(join(repository, "payload.txt"), "phase-five\n");
    await git(repository, ["init", "--initial-branch", "main"]);
    await git(repository, ["config", "user.email", "redner@example.test"]);
    await git(repository, ["config", "user.name", "redner test"]);
    await git(repository, ["add", "Dockerfile", "payload.txt"]);
    await git(repository, ["commit", "-m", "test image"]);

    const project = await database.project.create({
      data: {
        name: "Phase Five Integration",
        slug: `phase-five-${Date.now()}`,
        repoUrl: repository,
        branch: "main",
        appPort: 3000,
      },
    });
    projectId = project.id;
    const deployment = await database.deployment.create({
      data: {
        projectId: project.id,
        snapshotRepoUrl: repository,
        snapshotBranch: "main",
        snapshotSlug: project.slug,
        snapshotAppPort: 3000,
        logs: {
          create: { sequence: 1, type: "system", message: "Deployment queued" },
        },
      },
    });

    const store = new PrismaWorkerDeploymentStore(database);
    const executor = new CloneBuildExecutor(store, {
      buildRoot,
      cloneTimeoutMs: 30_000,
      buildTimeoutMs: 120_000,
      maxLogLines: 500,
      maxLogLineLength: 1_000,
    });
    const workItem = await store.load(deployment.id);
    assert.notEqual(workItem, null);
    await executor.execute(workItem!);

    const stored = await database.deployment.findUniqueOrThrow({
      where: { id: deployment.id },
      include: { logs: { orderBy: { sequence: "asc" } } },
    });
    imageName = stored.imageName ?? undefined;
    assert.equal(stored.status, "building");
    assert.match(stored.commitHash ?? "", /^[0-9a-f]{40}$/);
    assert.equal(imageName, `redner-${project.id}:${deployment.id}`);
    assert.deepEqual(
      stored.logs.map((log) => log.sequence),
      stored.logs.map((_log, index) => index + 1),
    );
    assert.ok(stored.logs.some((log) => log.type === "build"));

    await runProcess("docker", ["image", "inspect", imageName], processOptions());
  } finally {
    if (imageName !== undefined) {
      await runProcess(
        "docker",
        ["image", "rm", "--force", imageName],
        processOptions(),
      ).catch(() => undefined);
    }
    if (projectId !== undefined) {
      await database.project.deleteMany({ where: { id: projectId } });
    }
    await database.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});

async function git(cwd: string, args: string[]): Promise<void> {
  await runProcess("git", args, { ...processOptions(), cwd });
}

function processOptions() {
  return {
    timeoutMs: 120_000,
    maxLines: 500,
    maxLineLength: 1_000,
  };
}
