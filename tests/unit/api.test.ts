import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApp,
  DuplicateProjectSlugError,
  PrismaDeploymentStore,
  type AppDependencies,
  type DeploymentStore,
  type DeploymentLogStore,
  type ProjectStore,
} from "@redner/api";
import { Prisma, type DatabaseClient } from "@redner/database";
import type {
  DeploymentCancellationPublisher,
  DeploymentLogSubscriber,
  DeploymentQueue,
  ProjectActionQueue,
} from "@redner/queue";
import type {
  CreateProjectInput,
  Deployment,
  DeploymentLog,
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
    findById: async () => null,
    requestCancellation: async () => ({ kind: "not_active" }),
    markCancelled: async () => undefined,
    fail: async () => undefined,
    ...overrides,
  };
}

function deploymentLog(overrides: Partial<DeploymentLog> = {}): DeploymentLog {
  return {
    id: "log-1",
    deploymentId: "deployment-1",
    sequence: 1,
    type: "system",
    message: "Deployment queued",
    createdAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

function logStore(overrides: Partial<DeploymentLogStore> = {}): DeploymentLogStore {
  return {
    deploymentExists: async () => true,
    listAfter: async () => [],
    ...overrides,
  };
}

function logSubscriber(): DeploymentLogSubscriber {
  return {
    subscribe: async () => async () => undefined,
    close: async () => undefined,
  };
}

function deploymentQueue(
  overrides: Partial<DeploymentQueue> = {},
): DeploymentQueue {
  return {
    enqueue: async () => undefined,
    cancelWaiting: async () => false,
    hasJob: async () => false,
    close: async () => undefined,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AppDependencies["checks"]> = {},
  projects: ProjectStore = projectStore(),
  deployments: DeploymentStore = deploymentStore(),
  queue: DeploymentQueue = deploymentQueue(),
  projectActionQueue: ProjectActionQueue = {
    enqueue: async () => undefined,
    close: async () => undefined,
  },
  cancellationPublisher: DeploymentCancellationPublisher = {
    publish: async () => undefined,
    close: async () => undefined,
  },
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
    projectActionQueue,
    logs: logStore(),
    logSubscriber: logSubscriber(),
    cancellationPublisher,
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

test("stopped deployed projects queue resource cleanup before deletion", async (context) => {
  const calls: string[] = [];
  const actions: ProjectActionQueue = {
    enqueue: async (projectId, action) => calls.push(`${projectId}:${action}`),
    close: async () => undefined,
  };
  const projects = projectStore({
    deleteIfInactive: async () => "cleanup_required",
  });
  const app = buildApp({
    dependencies: dependencies(
      {},
      projects,
      deploymentStore(),
      deploymentQueue(),
      actions,
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "DELETE",
    url: "/projects/project-1",
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { status: "deleting" });
  assert.deepEqual(calls, ["project-1:delete"]);
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

test("project runtime actions verify the project and enqueue work", async (context) => {
  const calls: string[] = [];
  const actions: ProjectActionQueue = {
    enqueue: async (projectId, action) => calls.push(`${projectId}:${action}`),
    close: async () => undefined,
  };
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore({
        findById: async () =>
          project({ status: "running", activeDeploymentId: "deployment-1" }),
      }),
      deploymentStore(),
      deploymentQueue(),
      actions,
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/project-1/stop",
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { action: "stop", status: "queued" });
  assert.deepEqual(calls, ["project-1:stop"]);
});

test("project runtime actions reject impossible state transitions", async (context) => {
  const calls: string[] = [];
  const actions: ProjectActionQueue = {
    enqueue: async (projectId, action) => calls.push(`${projectId}:${action}`),
    close: async () => undefined,
  };
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore({ findById: async () => project() }),
      deploymentStore(),
      deploymentQueue(),
      actions,
    ),
    logger: false,
  });
  context.after(() => app.close());

  const stop = await app.inject({
    method: "POST",
    url: "/projects/project-1/stop",
  });
  const restart = await app.inject({
    method: "POST",
    url: "/projects/project-1/restart",
  });

  assert.equal(stop.statusCode, 409);
  assert.equal(stop.json().error.code, "PROJECT_NOT_DEPLOYED");
  assert.equal(restart.statusCode, 409);
  assert.equal(restart.json().error.code, "PROJECT_NOT_DEPLOYED");
  assert.deepEqual(calls, []);
});

test("project runtime actions reject missing projects", async (context) => {
  const app = buildApp({ dependencies: dependencies(), logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/missing/restart",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "PROJECT_NOT_FOUND");
});

test("project runtime actions report queue failures", async (context) => {
  const actions: ProjectActionQueue = {
    enqueue: async () => { throw new Error("redis unavailable"); },
    close: async () => undefined,
  };
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore({
        findById: async () =>
          project({ status: "stopped", activeDeploymentId: "deployment-1" }),
      }),
      deploymentStore(),
      deploymentQueue(),
      actions,
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/projects/project-1/restart",
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "QUEUE_UNAVAILABLE");
});

test("cancellation retries a concurrent log sequence conflict", async () => {
  let attempts = 0;
  const conflict = new Prisma.PrismaClientKnownRequestError(
    "Log sequence conflict",
    { code: "P2002", clientVersion: "test" },
  );
  const database = {
    $transaction: async () => {
      attempts += 1;
      if (attempts === 1) throw conflict;
      return { kind: "requested", log: null };
    },
  } as unknown as DatabaseClient;
  const store = new PrismaDeploymentStore(database);

  assert.deepEqual(await store.requestCancellation("deployment-1"), {
    kind: "requested",
  });
  assert.equal(attempts, 2);
});

test("SSE disconnect unsubscribes even before backlog setup completes", async (context) => {
  let unsubscribeCalls = 0;
  const appDependencies = dependencies();
  appDependencies.logs = logStore();
  appDependencies.logSubscriber = {
    subscribe: async () => async () => {
      unsubscribeCalls += 1;
    },
    close: async () => undefined,
  };
  const app = buildApp({ dependencies: appDependencies, logger: false });
  context.after(() => app.close());
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const abort = new AbortController();
  const response = await fetch(`${address}/deployments/deployment-1/logs/stream`, {
    signal: abort.signal,
  });

  abort.abort();
  await response.body?.cancel().catch(() => undefined);
  const deadline = Date.now() + 1_000;
  while (unsubscribeCalls === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(unsubscribeCalls, 1);
});

test("deployment detail and paginated logs are returned in sequence", async (context) => {
  const entries = [
    deploymentLog({ id: "log-2", sequence: 2, message: "Cloning" }),
    deploymentLog({ id: "log-3", sequence: 3, message: "Building" }),
  ];
  const appDependencies = dependencies(
    {},
    projectStore(),
    deploymentStore({ findById: async () => deployment() }),
  );
  appDependencies.logs = logStore({
    listAfter: async (_deploymentId, after, limit) =>
      entries.filter((entry) => entry.sequence > after).slice(0, limit),
  });
  const app = buildApp({ dependencies: appDependencies, logger: false });
  context.after(() => app.close());

  const detail = await app.inject({
    method: "GET",
    url: "/deployments/deployment-1",
  });
  const logs = await app.inject({
    method: "GET",
    url: "/deployments/deployment-1/logs?after=1&limit=1",
  });

  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().deployment.id, "deployment-1");
  assert.deepEqual(logs.json(), { logs: [entries[0]], nextSequence: 2 });
});

test("logs return not found for an unknown deployment", async (context) => {
  const appDependencies = dependencies();
  appDependencies.logs = logStore({ deploymentExists: async () => false });
  const app = buildApp({ dependencies: appDependencies, logger: false });
  context.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/deployments/missing/logs",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "DEPLOYMENT_NOT_FOUND");
});

test("cancel removes a queued deployment and finalizes it immediately", async (context) => {
  const calls: string[] = [];
  const deployments = deploymentStore({
    requestCancellation: async () => {
      calls.push("requested");
      return { kind: "requested" };
    },
    markCancelled: async () => {
      calls.push("cancelled");
    },
  });
  const queue = deploymentQueue({
    cancelWaiting: async () => {
      calls.push("removed");
      return true;
    },
  });
  const cancellationPublisher: DeploymentCancellationPublisher = {
    publish: async (id) => {
      calls.push(`signalled:${id}`);
    },
    close: async () => undefined,
  };
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore(),
      deployments,
      queue,
      undefined,
      cancellationPublisher,
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/deployments/deployment-1/cancel",
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().status, "cancelled");
  assert.deepEqual(calls, [
    "requested",
    "removed",
    "signalled:deployment-1",
    "cancelled",
  ]);
});

test("cancel signals an active deployment without marking it failed", async (context) => {
  let signalled = false;
  let finalized = false;
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore(),
      deploymentStore({
        requestCancellation: async () => ({ kind: "requested" }),
        markCancelled: async () => {
          finalized = true;
        },
      }),
      deploymentQueue({ cancelWaiting: async () => false }),
      undefined,
      {
        publish: async () => {
          signalled = true;
        },
        close: async () => undefined,
      },
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/deployments/deployment-1/cancel",
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().status, "cancelling");
  assert.equal(signalled, true);
  assert.equal(finalized, false);
});

test("cancel rejects terminal deployments", async (context) => {
  const app = buildApp({
    dependencies: dependencies(
      {},
      projectStore(),
      deploymentStore({
        requestCancellation: async () => ({ kind: "not_active" }),
      }),
    ),
    logger: false,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/deployments/deployment-1/cancel",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "DEPLOYMENT_NOT_ACTIVE");
});
