import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DockerContainerLifecycle,
  loadWorkerConfig,
  type ProcessRunner,
  type WorkerDeploymentStore,
} from "@redner/worker";

const deployment = {
  id: "deployment-1",
  projectId: "project-1",
  snapshotRepoUrl: "https://github.com/example/app.git",
  snapshotBranch: "main",
  snapshotSlug: "app",
  snapshotAppPort: 3000,
};

test("relative Caddy route paths resolve from the repository root", () => {
  const workerConfig = loadWorkerConfig({
    REDNER_CADDY_ROUTES_DIR: "./data/caddy/routes",
  });
  assert.equal(
    workerConfig.REDNER_CADDY_ROUTES_DIR,
    join(process.cwd(), "data/caddy/routes"),
  );
});

function store(overrides: Partial<WorkerDeploymentStore> = {}): WorkerDeploymentStore {
  return {
    load: async () => deployment,
    appendSystemLog: async () => undefined,
    appendBuildLog: async () => undefined,
    appendRuntimeLog: async () => undefined,
    markCloning: async () => undefined,
    markBuilding: async () => undefined,
    markStarting: async () => undefined,
    isCancellationRequested: async () => false,
    markCancelled: async () => undefined,
    promote: async () => null,
    fail: async () => undefined,
    ...overrides,
  };
}

function config(routesDir: string, healthTimeoutMs = 1_000) {
  return {
    proxyNetwork: "redner_proxy",
    caddyContainer: "redner-caddy",
    caddyRoutesDir: routesDir,
    healthTimeoutMs,
    memoryLimit: "128m",
    cpuLimit: "0.5",
    pidsLimit: 64,
  };
}

test("database promotion failure restores the previous Caddy route", async () => {
  const routesDir = await mkdtemp(join(tmpdir(), "redner-phase6-routes-"));
  const routePath = join(routesDir, "app.caddy");
  const previousRoute = "http://app.localhost {\n  reverse_proxy old:3000\n}\n";
  await writeFile(routePath, previousRoute);
  const calls: string[][] = [];
  const process: ProcessRunner = async (_command, args) => {
    calls.push(args);
    return { stdout: args[0] === "run" ? "candidate-id\n" : "" };
  };
  const lifecycle = new DockerContainerLifecycle(
    store({ promote: async () => { throw new Error("database unavailable"); } }),
    config(routesDir),
    process,
  );

  try {
    await assert.rejects(lifecycle.promote(deployment, "image:tag"), /database unavailable/);
    assert.equal(await readFile(routePath, "utf8"), previousRoute);
    assert.equal(calls.filter((args) => args.includes("reload")).length, 2);
    assert.ok(calls.some((args) => args.join(" ") === "rm --force redner-project-1-deployment-1"));
  } finally {
    await rm(routesDir, { recursive: true, force: true });
  }
});

test("unhealthy candidate is removed without promotion", async () => {
  const routesDir = await mkdtemp(join(tmpdir(), "redner-phase6-unhealthy-"));
  let promoteCalls = 0;
  const calls: string[][] = [];
  const process: ProcessRunner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "run") return { stdout: "candidate-id\n" };
    if (args[0] === "exec" && args.includes("wget")) throw new Error("unhealthy");
    return { stdout: "" };
  };
  const lifecycle = new DockerContainerLifecycle(
    store({ promote: async () => { promoteCalls += 1; return null; } }),
    config(routesDir, 1),
    process,
  );

  try {
    await assert.rejects(lifecycle.promote(deployment, "image:tag"), /health check timed out/);
    assert.equal(promoteCalls, 0);
    assert.equal(calls.filter((args) => args.join(" ") === "rm --force redner-project-1-deployment-1").length, 2);
  } finally {
    await rm(routesDir, { recursive: true, force: true });
  }
});

test("old-container cleanup failure does not fail an already promoted deployment", async () => {
  const routesDir = await mkdtemp(join(tmpdir(), "redner-phase6-cleanup-"));
  let warning = "";
  const calls: string[][] = [];
  const process: ProcessRunner = async (_command, args) => {
    calls.push(args);
    if (args[0] === "run") return { stdout: "candidate-id\n" };
    if (args.join(" ") === "rm --force old-container") throw new Error("remove failed");
    return { stdout: "" };
  };
  const lifecycle = new DockerContainerLifecycle(
    store({
      promote: async () => "old-container",
      appendSystemLog: async (_id, message) => { warning = message; },
    }),
    config(routesDir),
    process,
  );

  try {
    await lifecycle.promote(deployment, "image:tag");
    const run = calls.find((args) => args[0] === "run");
    assert.ok(run?.includes("--cap-drop"));
    assert.ok(run?.includes("NET_BIND_SERVICE"));
    assert.match(warning, /Could not remove previous container/);
  } finally {
    await rm(routesDir, { recursive: true, force: true });
  }
});
