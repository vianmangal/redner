import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  DuplicateProjectSlugError,
  type AppDependencies,
  type ProjectStore,
} from "@redner/api";
import type { CreateProjectInput, Project } from "@redner/shared";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Todo API",
    slug: "todo-api",
    repoUrl: "https://github.com/example/todo-api.git",
    branch: "main",
    appPort: 3000,
    status: "idle",
    activeDeploymentId: null,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

function projectStore(overrides: Partial<ProjectStore> = {}): ProjectStore {
  return {
    create: async (input: CreateProjectInput) => project(input),
    list: async () => [],
    findById: async () => null,
    deleteIfInactive: async () => "not_found",
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AppDependencies["checks"]> = {},
  projects: ProjectStore = projectStore(),
): AppDependencies {
  return {
    checks: {
      database: async () => undefined,
      redis: async () => undefined,
      ...overrides,
    },
    projects,
    close: async () => undefined,
  };
}

test("health reports both dependencies as available", async (context) => {
  const app = buildApp({ dependencies: dependencies(), logger: false });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    dependencies: { database: "up", redis: "up" },
  });
});

test("health reports a failed dependency without hiding healthy ones", async (context) => {
  const app = buildApp({
    dependencies: dependencies({
      redis: async () => {
        throw new Error("connection refused");
      },
    }),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "degraded",
    dependencies: { database: "up", redis: "down" },
  });
});

test("unknown routes use the shared error shape", async (context) => {
  const app = buildApp({ dependencies: dependencies(), logger: false });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/missing" });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

test("project routes create, list, find, and delete projects", async (context) => {
  const stored = project();
  const projects = projectStore({
    create: async () => stored,
    list: async () => [stored],
    findById: async () => stored,
    deleteIfInactive: async () => "deleted",
  });
  const app = buildApp({
    dependencies: dependencies({}, projects),
    logger: false,
  });
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: stored.name,
      slug: stored.slug,
      repoUrl: stored.repoUrl,
      branch: stored.branch,
      appPort: stored.appPort,
    },
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.json(), { project: stored });

  const listed = await app.inject({ method: "GET", url: "/projects" });
  assert.deepEqual(listed.json(), { projects: [stored] });

  const found = await app.inject({
    method: "GET",
    url: `/projects/${stored.id}`,
  });
  assert.deepEqual(found.json(), { project: stored });

  const deleted = await app.inject({
    method: "DELETE",
    url: `/projects/${stored.id}`,
  });
  assert.equal(deleted.statusCode, 204);
});

test("project validation returns field-level details", async (context) => {
  const app = buildApp({ dependencies: dependencies(), logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "",
      slug: "Not Valid",
      repoUrl: "http://example.com/private.git",
      branch: "bad branch",
      appPort: 70000,
      unexpected: true,
    },
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(body.error.details.length >= 5);
});

test("duplicate project slugs return a conflict", async (context) => {
  const projects = projectStore({
    create: async () => {
      throw new DuplicateProjectSlugError();
    },
  });
  const app = buildApp({
    dependencies: dependencies({}, projects),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects",
    payload: {
      name: "Todo API",
      slug: "todo-api",
      repoUrl: "https://github.com/example/todo-api.git",
      branch: "main",
      appPort: 3000,
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "PROJECT_SLUG_CONFLICT");
});

test("malformed project IDs return a client error", async (context) => {
  const app = buildApp({ dependencies: dependencies(), logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/projects/%20",
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: {
      code: "INVALID_PROJECT_ID",
      message: "Project ID is required",
    },
  });
});
