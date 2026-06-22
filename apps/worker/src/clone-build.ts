import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import type {
  DeploymentWorkItem,
  WorkerDeploymentStore,
} from "./deployment-store.js";
import type { ContainerLifecycle } from "./container-lifecycle.js";
import {
  runProcess,
  type ProcessRunner,
  type RunProcessOptions,
} from "./process-runner.js";

export interface CloneBuildConfig {
  buildRoot: string;
  cloneTimeoutMs: number;
  buildTimeoutMs: number;
  maxLogLines: number;
  maxLogLineLength: number;
}

export interface DeploymentExecutor {
  execute(deployment: DeploymentWorkItem, signal?: AbortSignal): Promise<void>;
}

export class CloneBuildExecutor implements DeploymentExecutor {
  constructor(
    private readonly deployments: WorkerDeploymentStore,
    private readonly config: CloneBuildConfig,
    private readonly process: ProcessRunner = runProcess,
    private readonly containers?: ContainerLifecycle,
  ) {}

  async execute(deployment: DeploymentWorkItem, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await mkdir(this.config.buildRoot, { recursive: true });
    const workDirectory = await mkdtemp(
      join(this.config.buildRoot, `${deployment.id}-`),
    );
    const imageName = `redner-${deployment.projectId}:${deployment.id}`;

    try {
      await this.deployments.markCloning(deployment.id);
      await this.deployments.appendSystemLog(
        deployment.id,
        `Cloning ${deployment.snapshotRepoUrl} at ${deployment.snapshotBranch}`,
      );
      await this.process(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--single-branch",
          "--branch",
          deployment.snapshotBranch,
          "--",
          deployment.snapshotRepoUrl,
          workDirectory,
        ],
        this.processOptions(deployment.id, this.config.cloneTimeoutMs, undefined, signal),
      );

      const commit = await this.process(
        "git",
        ["-C", workDirectory, "rev-parse", "HEAD"],
        this.processOptions(deployment.id, this.config.cloneTimeoutMs, undefined, signal),
      );
      const commitHash = commit.stdout.trim();
      if (!/^[0-9a-f]{40}$/i.test(commitHash)) {
        throw new Error("Git returned an invalid commit hash");
      }

      const dockerfile = await lstat(join(workDirectory, "Dockerfile")).catch(
        () => null,
      );
      if (dockerfile === null || !dockerfile.isFile()) {
        throw new Error("Repository must contain a root Dockerfile");
      }

      await this.deployments.markBuilding(
        deployment.id,
        commitHash,
        imageName,
      );
      await this.deployments.appendSystemLog(
        deployment.id,
        `Building image ${imageName}`,
      );
      await this.process(
        "docker",
        ["build", "--file", "Dockerfile", "--tag", imageName, "."],
        this.processOptions(
          deployment.id,
          this.config.buildTimeoutMs,
          workDirectory,
          signal,
        ),
      );
      await this.deployments.appendSystemLog(
        deployment.id,
        "Image build complete",
      );
      await this.containers?.promote(deployment, imageName, signal);
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  private processOptions(
    deploymentId: string,
    timeoutMs: number,
    cwd?: string,
    signal?: AbortSignal,
  ): RunProcessOptions {
    return {
      ...(cwd !== undefined ? { cwd } : {}),
      ...(signal !== undefined ? { signal } : {}),
      timeoutMs,
      maxLines: this.config.maxLogLines,
      maxLineLength: this.config.maxLogLineLength,
      onLine: async ({ stream, message }) => {
        await this.deployments.appendBuildLog(
          deploymentId,
          stream === "stderr" ? `[stderr] ${message}` : message,
        );
      },
    };
  }
}
