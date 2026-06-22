import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  createDependencies,
  loadConfig,
} from "@redner/api";
import { createDatabaseClient } from "@redner/database";

test("project API persists a complete CRUD lifecycle", async (context) => {
  const config = loadConfig({ NODE_ENV: "test" });
  const dependencies = createDependencies(config);
  const app = buildApp({ dependencies, logger: false });
  const slug = `phase-three-${Date.now()}`;
  let projectId: string | undefined;

  context.after(async () => {
    if (projectId !== undefined) {
      await dependencies.projects.deleteIfInactive(projectId);
    }
    await app.close();
  });

  const invalid = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "Invalid",
      slug: "INVALID SLUG",
      repoUrl: "https://example.com/not-github.git",
      branch: "main",
      appPort: 0,
    },
  });
  assert.equal(invalid.statusCode, 400);

  const created = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "Phase Three Test",
      slug,
      repoUrl: "https://github.com/example/redner-test.git",
      branch: "main",
      appPort: 3000,
    },
  });
  assert.equal(created.statusCode, 201);
  projectId = created.json().project.id;

  const duplicate = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "Duplicate",
      slug,
      repoUrl: "https://github.com/example/duplicate.git",
      branch: "main",
      appPort: 3001,
    },
  });
  assert.equal(duplicate.statusCode, 409);

  const listed = await app.inject({ method: "GET", url: "/projects" });
  assert.ok(
    listed.json().projects.some((item: { id: string }) => item.id === projectId),
  );

  const found = await app.inject({
    method: "GET",
    url: `/projects/${projectId}`,
  });
  assert.equal(found.statusCode, 200);
  assert.equal(found.json().project.slug, slug);

  const deleted = await app.inject({
    method: "DELETE",
    url: `/projects/${projectId}`,
  });
  assert.equal(deleted.statusCode, 204);
  projectId = undefined;

  const missing = await app.inject({
    method: "GET",
    url: `/projects/${created.json().project.id}`,
  });
  assert.equal(missing.statusCode, 404);
});

test("project deletion is blocked while cancellation cleanup is pending", async () => {
  const config = loadConfig({ NODE_ENV: "test" });
  const dependencies = createDependencies(config);
  const database = createDatabaseClient(config.DATABASE_URL);
  const app = buildApp({ dependencies, logger: false });
  let projectId: string | undefined;

  try {
    const project = await database.project.create({
      data: {
        name: "Cancelling Project",
        slug: `cancelling-delete-${Date.now()}`,
        repoUrl: "https://github.com/example/app.git",
        branch: "main",
        appPort: 3000,
      },
    });
    projectId = project.id;
    await database.deployment.create({
      data: {
        projectId,
        status: "cancelling",
        snapshotRepoUrl: project.repoUrl,
        snapshotBranch: project.branch,
        snapshotSlug: project.slug,
        snapshotAppPort: project.appPort,
      },
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/projects/${project.id}`,
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "PROJECT_ACTIVE");
    assert.notEqual(
      await database.project.findUnique({ where: { id: project.id } }),
      null,
    );
  } finally {
    if (projectId !== undefined) {
      await database.project.deleteMany({ where: { id: projectId } });
    }
    await app.close();
    await database.$disconnect();
  }
});
