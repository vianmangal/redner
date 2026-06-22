import assert from "node:assert/strict";
import test from "node:test";

import type { Job } from "bullmq";

import type { DeploymentJobData } from "@redner/queue";
import {
  createDeploymentProcessor,
  type DeploymentExecutor,
  type ProjectLockManager,
  type WorkerDeploymentStore,
} from "@redner/worker";

function store(overrides: Partial<WorkerDeploymentStore> = {}) {
  const logs: string[] = [];
  let failure: string | undefined;
  const value: WorkerDeploymentStore = {
    load: async () => ({
      id: "deployment-1",
      projectId: "project-1",
      snapshotRepoUrl: "https://github.com/example/todo.git",
      snapshotBranch: "main",
      snapshotSlug: "todo",
      snapshotAppPort: 3000,
    }),
    appendSystemLog: async (_id, message) => {
      logs.push(message);
    },
    appendBuildLog: async (_id, message) => {
      logs.push(message);
    },
    markCloning: async () => undefined,
    markBuilding: async () => undefined,
    markStarting: async () => undefined,
    promote: async () => null,
    fail: async (_id, reason) => {
      failure = reason;
    },
    ...overrides,
  };
  return { value, logs, getFailure: () => failure };
}

function job(attemptsMade = 0, attempts = 3): Job<DeploymentJobData> {
  return {
    data: { deploymentId: "deployment-1" },
    attemptsMade,
    opts: { attempts },
  } as Job<DeploymentJobData>;
}

test("worker loads the snapshot, writes logs, and releases the project lock", async () => {
  const deployments = store();
  let released = false;
  const locks: ProjectLockManager = {
    acquire: async () => ({
      release: async () => {
        released = true;
      },
    }),
  };
  let executed = false;
  const executor: DeploymentExecutor = {
    execute: async () => {
      executed = true;
    },
  };

  await createDeploymentProcessor(deployments.value, locks, executor)(job());

  assert.equal(released, true);
  assert.equal(executed, true);
  assert.deepEqual(deployments.logs, [
    "Worker accepted deployment attempt 1",
    "Configuration loaded for todo from PostgreSQL",
  ]);
  assert.equal(deployments.getFailure(), undefined);
});

test("worker retries lock contention and marks the final attempt failed", async () => {
  const deployments = store();
  const locks: ProjectLockManager = { acquire: async () => null };
  const executor: DeploymentExecutor = { execute: async () => undefined };
  const process = createDeploymentProcessor(
    deployments.value,
    locks,
    executor,
  );

  await assert.rejects(process(job(0, 3)), /already running/);
  assert.equal(deployments.getFailure(), undefined);
  assert.match(deployments.logs[0] ?? "", /attempt 1 failed/);

  await assert.rejects(process(job(2, 3)), /already running/);
  assert.equal(
    deployments.getFailure(),
    "Another deployment is already running for this project",
  );
});

test("worker records a final clone/build failure and releases the lock", async () => {
  const deployments = store();
  let released = false;
  const locks: ProjectLockManager = {
    acquire: async () => ({
      release: async () => {
        released = true;
      },
    }),
  };
  const executor: DeploymentExecutor = {
    execute: async () => {
      throw new Error("Repository must contain a root Dockerfile");
    },
  };

  await assert.rejects(
    createDeploymentProcessor(deployments.value, locks, executor)(job(2, 3)),
    /root Dockerfile/,
  );
  assert.equal(released, true);
  assert.equal(
    deployments.getFailure(),
    "Repository must contain a root Dockerfile",
  );
});
