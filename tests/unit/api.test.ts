import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  DuplicateProjectSlugError,
  type AppDependencies,
  type DeploymentStore,
  type ProjectStore,
} from "@redner/api";
import type { DeploymentQueue } from "@redner/queue";
import type {
  CreateProjectInput,
  Deployment,
  Project,
} from "@redner/shared";

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

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: "deployment-1",
    projectId: "project-1",
    status: "queued",
    trigger: "manual",
    snapshotRepoUrl: "https://github.com/example/todo-api.git",
    snapshotBranch: "main",
    snapshotSlug: "todo-api",
    snapshotAppPort: 3000,
    commitHash: null,
    imageName: null,
    containerId: null,
    failureReason: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentStore(
  overrides: Partial<DeploymentStore> = {},
): DeploymentStore {
  return {
    createQueued: async () => ({
      kind: "created",
      deployment: deployment(),
    }),
    listForProject: async () => [],
    fail: async () => undefined,
    ...overrides,
  };
}

function deploymentQueue(
  overrides: Partial<DeploymentQueue> = {},
): DeploymentQueue {
  return {
    enqueue: async () => undefined,
    close: async () => undefined,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AppDependencies["checks"]> = {},
  projects: ProjectStore = projectStore(),
  deployments: DeploymentStore = deploymentStore(),
  queue: DeploymentQueue = deploymentQueue(),
): AppDependencies {
  return {
    checks: {
      database: async () => undefined,
      redis: async () => undefined,
      ...overrides,
    },
    projects,
    deployments,
    deploymentQueue: queue,
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

test("deploy creates a record before enqueueing and returns promptly", async (context) => {
  const calls: string[] = [];
  const stored = deployment();
  const deployments = deploymentStore({
    createQueued: async () => {
      calls.push("created");
      return { kind: "created", deployment: stored };
    },
  });
  const queue = deploymentQueue({
    enqueue: async (id) => {
      calls.push(`queued:${id}`);
    },
  });
  const app = buildApp({
    dependencies: dependencies({}, projectStore(), deployments, queue),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/project-1/deploy",
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { deployment: stored });
  assert.deepEqual(calls, ["created", "queued:deployment-1"]);
});

test("deploy rejects a second active deployment", async (context) => {
  const deployments = deploymentStore({
    createQueued: async () => ({ kind: "conflict" }),
  });
  const app = buildApp({
    dependencies: dependencies({}, projectStore(), deployments),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/project-1/deploy",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "DEPLOYMENT_ACTIVE");
});

test("queue failures mark the deployment failed", async (context) => {
  let failure: { id: string; reason: string } | undefined;
  const deployments = deploymentStore({
    fail: async (id, reason) => {
      failure = { id, reason };
    },
  });
  const queue = deploymentQueue({
    enqueue: async () => {
      throw new Error("redis unavailable");
    },
  });
  const app = buildApp({
    dependencies: dependencies({}, projectStore(), deployments, queue),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/project-1/deploy",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "QUEUE_UNAVAILABLE");
  assert.deepEqual(failure, {
    id: "deployment-1",
    reason: "The deployment queue is unavailable",
  });
});
