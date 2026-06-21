import assert from "node:assert/strict";
import test from "node:test";

import { createDatabaseClient } from "@redner/database";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://redner:redner@localhost:5432/redner?schema=public";

test("Prisma creates and reads a project, deployment, and ordered log", async () => {
  const database = createDatabaseClient(databaseUrl);
  const slug = `phase-two-${Date.now()}`;

  try {
    const project = await database.project.create({
      data: {
        name: "Phase Two Test",
        slug,
        repoUrl: "https://github.com/example/redner-test.git",
        branch: "main",
        appPort: 3000,
      },
    });

    const deployment = await database.deployment.create({
      data: {
        projectId: project.id,
        snapshotRepoUrl: project.repoUrl,
        snapshotBranch: project.branch,
        snapshotSlug: project.slug,
        snapshotAppPort: project.appPort,
        logs: {
          create: {
            sequence: 1,
            type: "system",
            message: "Deployment queued",
          },
        },
      },
    });

    await database.project.update({
      where: { id: project.id },
      data: { activeDeploymentId: deployment.id },
    });

    const stored = await database.project.findUniqueOrThrow({
      where: { id: project.id },
      include: {
        activeDeployment: {
          include: { logs: { orderBy: { sequence: "asc" } } },
        },
      },
    });

    assert.equal(stored.status, "idle");
    assert.equal(stored.activeDeployment?.snapshotSlug, slug);
    assert.equal(stored.activeDeployment?.logs[0]?.message, "Deployment queued");
  } finally {
    await database.project.deleteMany({ where: { slug } });
    await database.$disconnect();
  }
});
