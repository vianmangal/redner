import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DeploymentWorkItem, WorkerDeploymentStore } from "./deployment-store.js";
import { runProcess, type ProcessRunner } from "./process-runner.js";
import type { RuntimeLogCollector } from "./runtime-logs.js";

export interface ContainerConfig {
  proxyNetwork: string;
  caddyContainer: string;
  caddyRoutesDir: string;
  healthTimeoutMs: number;
  memoryLimit: string;
  cpuLimit: string;
  pidsLimit: number;
}

export interface ContainerLifecycle {
  promote(
    deployment: DeploymentWorkItem,
    imageName: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

export class DockerContainerLifecycle implements ContainerLifecycle {
  constructor(
    private readonly deployments: WorkerDeploymentStore,
    private readonly config: ContainerConfig,
    private readonly process: ProcessRunner = runProcess,
    private readonly runtimeLogs?: RuntimeLogCollector,
  ) {}

  async promote(
    deployment: DeploymentWorkItem,
    imageName: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const name = `redner-${deployment.projectId}-${deployment.id}`;
    let promoted = false;
    let routePath: string | undefined;
    let previousRoute: string | null | undefined;
    let routeChanged = false;
    const containerStartedAt = new Date();
    await this.process("docker", ["rm", "--force", name], this.options(30_000)).catch(() => undefined);

    try {
      const started = await this.process(
        "docker",
        [
          "run", "--detach", "--name", name,
          "--label", "redner.managed=true",
          "--label", `redner.project-id=${deployment.projectId}`,
          "--label", `redner.deployment-id=${deployment.id}`,
          "--network", this.config.proxyNetwork,
          "--memory", this.config.memoryLimit,
          "--cpus", this.config.cpuLimit,
          "--pids-limit", String(this.config.pidsLimit),
          "--cap-drop", "ALL",
          "--cap-add", "NET_BIND_SERVICE",
          "--security-opt", "no-new-privileges=true",
          "--restart", "no",
          imageName,
        ],
        this.options(60_000, signal),
      );
      const containerId = started.stdout.trim();
      await this.deployments.markStarting(deployment.id, containerId);
      await this.deployments.appendSystemLog(deployment.id, `Started candidate container ${name}`);
      await this.checkHealth(name, deployment.snapshotAppPort, signal);
      signal?.throwIfAborted();

      await mkdir(this.config.caddyRoutesDir, { recursive: true });
      routePath = join(this.config.caddyRoutesDir, `${deployment.snapshotSlug}.caddy`);
      const temporaryPath = `${routePath}.${deployment.id}.tmp`;
      previousRoute = await readFile(routePath, "utf8").catch(() => null);
      const route = `http://${deployment.snapshotSlug}.localhost {\n  reverse_proxy ${name}:${deployment.snapshotAppPort}\n}\n`;
      await writeFile(temporaryPath, route, { encoding: "utf8", mode: 0o644 });
      await rename(temporaryPath, routePath);
      routeChanged = true;

      await this.caddy("validate", signal);
      await this.caddy("reload", signal);

      const previousContainer = await this.deployments.promote(
        deployment.id,
        deployment.projectId,
        containerId,
      );
      promoted = true;
      await this.deployments.appendSystemLog(
        deployment.id,
        `Promoted ${name} at ${deployment.snapshotSlug}.localhost`,
      ).catch(() => undefined);
      if (previousContainer !== null && previousContainer !== containerId) {
        await this.process(
          "docker",
          ["rm", "--force", previousContainer],
          this.options(30_000),
        ).catch(async (error) => {
          const reason = error instanceof Error ? error.message : "unknown error";
          await this.deployments.appendSystemLog(
            deployment.id,
            `Could not remove previous container ${previousContainer}: ${reason}`,
          ).catch(() => undefined);
        });
      }
      await this.resumeRuntimeLogs(deployment.id, containerId, containerStartedAt);
    } catch (error) {
      if (routeChanged && !promoted && routePath !== undefined && previousRoute !== undefined) {
        try {
          if (previousRoute === null) await rm(routePath, { force: true });
          else await writeFile(routePath, previousRoute, "utf8");
          await this.caddy("reload");
        } catch (rollbackError) {
          const originalReason = error instanceof Error ? error.message : String(error);
          const rollbackReason = rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
          throw new Error(
            `${originalReason}; Caddy route rollback failed: ${rollbackReason}`,
            { cause: error },
          );
        }
      }
      throw error;
    } finally {
      if (!promoted) {
        await this.process("docker", ["rm", "--force", name], this.options(30_000)).catch(() => undefined);
      }
    }
  }

  async checkHealth(name: string, port: number, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + this.config.healthTimeoutMs;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      try {
        await this.process(
          "docker",
          ["exec", this.config.caddyContainer, "wget", "--quiet", "--spider", `http://${name}:${port}/`],
          this.options(5_000, signal),
        );
        return;
      } catch {
        signal?.throwIfAborted();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(`Candidate health check timed out after ${this.config.healthTimeoutMs}ms`);
  }

  async resumeRuntimeLogs(
    deploymentId: string,
    containerId: string,
    since: Date,
  ): Promise<void> {
    await this.runtimeLogs
      ?.start(deploymentId, containerId, since)
      .catch(() => undefined);
  }

  private caddy(command: "validate" | "reload", signal?: AbortSignal) {
    return this.process(
      "docker",
      ["exec", this.config.caddyContainer, "caddy", command, "--config", "/etc/caddy/Caddyfile"],
      this.options(30_000, signal),
    );
  }

  private options(timeoutMs: number, signal?: AbortSignal) {
    return {
      timeoutMs,
      maxLines: 200,
      maxLineLength: 2_000,
      ...(signal !== undefined ? { signal } : {}),
    };
  }
}
