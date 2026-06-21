import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  createDependencies,
  loadConfig,
} from "@redner/api";

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
