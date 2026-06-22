import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CloneBuildExecutor,
  ProcessExecutionError,
  runProcess,
  type ProcessRunner,
  type WorkerDeploymentStore,
} from "@redner/worker";

const deployment = {
  id: "deployment-1",
  projectId: "project-1",
  snapshotRepoUrl: "https://github.com/example/app.git",
  snapshotBranch: "feature/safe-branch",
  snapshotSlug: "app",
  snapshotAppPort: 3000,
};

function deploymentStore() {
  const events: string[] = [];
  const value: WorkerDeploymentStore = {
    load: async () => deployment,
    appendSystemLog: async (_id, message) => events.push(`system:${message}`),
    appendBuildLog: async (_id, message) => events.push(`build:${message}`),
    appendRuntimeLog: async (_id, message) => events.push(`runtime:${message}`),
    markCloning: async () => events.push("status:cloning"),
    markBuilding: async (_id, commit, image) =>
      events.push(`status:building:${commit}:${image}`),
    markStarting: async () => undefined,
    isCancellationRequested: async () => false,
    markCancelled: async () => undefined,
    promote: async () => null,
    fail: async () => undefined,
  };
  return { value, events };
}

test("clone/build uses argument arrays, records metadata, and cleans its directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "redner-phase5-unit-"));
  const deployments = deploymentStore();
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  const runner: ProcessRunner = async (command, args, options) => {
    calls.push({
      command,
      args,
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    });
    if (command === "git" && args[0] === "clone") {
      await writeFile(join(args.at(-1) ?? "", "Dockerfile"), "FROM scratch\n");
    }
    return {
      stdout:
        command === "git" && args.includes("rev-parse")
          ? "a".repeat(40) + "\n"
          : "",
    };
  };

  const executor = new CloneBuildExecutor(
    deployments.value,
    {
      buildRoot: root,
      cloneTimeoutMs: 1_000,
      buildTimeoutMs: 2_000,
      maxLogLines: 100,
      maxLogLineLength: 200,
    },
    runner,
  );

  await executor.execute(deployment);

  assert.deepEqual(calls[0]?.args, [
    "clone",
    "--depth",
    "1",
    "--single-branch",
    "--branch",
    "feature/safe-branch",
    "--",
    "https://github.com/example/app.git",
    calls[0]?.args.at(-1),
  ]);
  assert.deepEqual(calls[2]?.args, [
    "build",
    "--file",
    "Dockerfile",
    "--tag",
    "redner-project-1:deployment-1",
    ".",
  ]);
  assert.equal(calls[2]?.cwd, calls[0]?.args.at(-1));
  assert.ok(
    deployments.events.includes(
      `status:building:${"a".repeat(40)}:redner-project-1:deployment-1`,
    ),
  );
  assert.deepEqual(await readdir(root), []);
});

test("clone/build rejects a missing root Dockerfile and still cleans up", async () => {
  const root = await mkdtemp(join(tmpdir(), "redner-phase5-missing-"));
  const deployments = deploymentStore();
  const runner: ProcessRunner = async (command, args) => ({
    stdout:
      command === "git" && args.includes("rev-parse")
        ? "b".repeat(40) + "\n"
        : "",
  });
  const executor = new CloneBuildExecutor(
    deployments.value,
    {
      buildRoot: root,
      cloneTimeoutMs: 1_000,
      buildTimeoutMs: 2_000,
      maxLogLines: 100,
      maxLogLineLength: 200,
    },
    runner,
  );

  await assert.rejects(
    executor.execute(deployment),
    /root Dockerfile/,
  );
  assert.deepEqual(await readdir(root), []);
});

test("process runner preserves literal arguments and bounds output", async () => {
  const lines: string[] = [];
  const result = await runProcess(
    process.execPath,
    [
      "-e",
      "console.log(process.argv[1]); console.log('second-line')",
      "$(echo not-a-shell)",
    ],
    {
      timeoutMs: 2_000,
      maxLines: 1,
      maxLineLength: 12,
      onLine: async ({ message }) => {
        lines.push(message);
      },
    },
  );

  assert.match(result.stdout, /\$\(echo not-a-shell\)/);
  assert.deepEqual(lines, [
    "$(echo not-a",
    "[output truncated after 1 lines]",
  ]);
});

test("process runner terminates commands at the configured timeout", async () => {
  await assert.rejects(
    runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
      timeoutMs: 50,
      maxLines: 10,
      maxLineLength: 100,
    }),
    (error) =>
      error instanceof ProcessExecutionError && error.timedOut,
  );
});

test("process runner terminates commands when cancellation is requested", async () => {
  const controller = new AbortController();
  const running = runProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 10000)"],
    {
      timeoutMs: 10_000,
      maxLines: 10,
      maxLineLength: 100,
      signal: controller.signal,
    },
  );
  setTimeout(() => controller.abort(), 20);

  await assert.rejects(
    running,
    (error) =>
      error instanceof ProcessExecutionError && error.cancelled && !error.timedOut,
  );
});
