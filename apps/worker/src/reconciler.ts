import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import type { DatabaseClient } from "@redner/database";
import type { DeploymentQueue } from "@redner/queue";
import type { ProjectStatus } from "@redner/shared";

import type { WorkerDeploymentStore } from "./deployment-store.js";
import { runProcess, type ProcessRunner } from "./process-runner.js";
import type { RuntimeLogCollector } from "./runtime-logs.js";

export interface ReconciliationConfig {
  buildRoot: string;
  caddyContainer: string;
  caddyRoutesDir: string;
}

export interface ReconciliationResult {
  abandonedDeployments: number;
  removedContainers: number;
  removedImages: number;
  removedTemporaryDirectories: number;
  removedRoutes: number;
  recoveredProjects: number;
}

export class WorkerReconciler {
  constructor(
    private readonly database: DatabaseClient,
    private readonly deployments: WorkerDeploymentStore,
    private readonly queue: Pick<DeploymentQueue, "hasJob">,
    private readonly config: ReconciliationConfig,
    private readonly process: ProcessRunner = runProcess,
    private readonly runtimeLogs?: RuntimeLogCollector,
  ) {}

  async reconcile(): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      abandonedDeployments: 0,
      removedContainers: 0,
      removedImages: 0,
      removedTemporaryDirectories: 0,
      removedRoutes: 0,
      recoveredProjects: 0,
    };

    const projects = await this.database.project.findMany({
      include: { activeDeployment: true },
    });
    const activeDeploymentIds = new Set(
      projects.flatMap((project) =>
        project.activeDeploymentId === null ? [] : [project.activeDeploymentId],
      ),
    );
    const activeContainerIds = new Set(
      projects.flatMap((project) =>
        project.activeDeployment?.containerId === null ||
        project.activeDeployment?.containerId === undefined
          ? []
          : [project.activeDeployment.containerId],
      ),
    );
    const activeImages = new Set(
      projects.flatMap((project) =>
        project.activeDeployment?.imageName === null ||
        project.activeDeployment?.imageName === undefined
          ? []
          : [project.activeDeployment.imageName],
      ),
    );

    const unfinished = await this.database.deployment.findMany({
      where: {
        status: {
          in: ["queued", "cloning", "building", "starting", "cancelling"],
        },
      },
      select: { id: true, status: true },
    });
    for (const deployment of unfinished) {
      if (deployment.status === "queued") {
        const stillQueued = await this.queue.hasJob(deployment.id).catch(() => true);
        if (stillQueued) continue;
      }
      if (deployment.status === "cancelling") {
        await this.deployments.markCancelled(deployment.id);
      } else {
        await this.deployments.fail(
          deployment.id,
          deployment.status === "queued"
            ? "Deployment queue entry was lost before worker restart"
            : "Worker restarted before deployment completed",
        );
      }
      result.abandonedDeployments += 1;
    }

    const managedContainers = await this.listManagedContainers();
    for (const containerId of managedContainers) {
      if (activeContainerIds.has(containerId)) continue;
      const removed = await this.process(
        "docker",
        ["rm", "--force", containerId],
        options(30_000),
      ).then(() => true).catch(() => false);
      if (removed) result.removedContainers += 1;
    }

    const knownImages = await this.database.deployment.findMany({
      where: { imageName: { not: null } },
      select: { id: true, imageName: true },
    });
    for (const image of knownImages) {
      if (
        image.imageName === null ||
        activeDeploymentIds.has(image.id) ||
        activeImages.has(image.imageName)
      ) {
        continue;
      }
      const exists = await this.process(
        "docker",
        ["image", "inspect", image.imageName],
        options(30_000),
      ).then(() => true).catch(() => false);
      if (!exists) continue;
      const removed = await this.process(
        "docker",
        ["image", "rm", "--force", image.imageName],
        options(30_000),
      ).then(() => true).catch(() => false);
      if (removed) result.removedImages += 1;
    }

    await mkdir(this.config.buildRoot, { recursive: true });
    const buildEntries = await readdir(this.config.buildRoot, {
      withFileTypes: true,
    });
    for (const entry of buildEntries) {
      if (!entry.isDirectory()) continue;
      await rm(join(this.config.buildRoot, entry.name), {
        recursive: true,
        force: true,
      });
      result.removedTemporaryDirectories += 1;
    }

    const activeRouteNames = new Set<string>();
    for (const project of projects) {
      const active = project.activeDeployment;
      if (active?.containerId === null || active?.containerId === undefined) continue;
      const state = await this.inspectContainer(active.containerId);
      const nextStatus: ProjectStatus = state === null
        ? "unhealthy"
        : state.running
          ? "running"
          : project.status === "stopped"
            ? "stopped"
            : "unhealthy";
      if (state !== null) activeRouteNames.add(`${project.slug}.caddy`);
      if (project.status !== nextStatus) {
        await this.database.project.update({
          where: { id: project.id },
          data: { status: nextStatus },
        });
        await this.deployments.appendSystemLog(
          active.id,
          `Worker reconciliation set project status to ${nextStatus}`,
        );
        result.recoveredProjects += 1;
      }
      if (state?.running === true) {
        await this.runtimeLogs
          ?.start(active.id, active.containerId, new Date())
          .catch(() => undefined);
      }
    }

    await mkdir(this.config.caddyRoutesDir, { recursive: true });
    const routeEntries = await readdir(this.config.caddyRoutesDir, {
      withFileTypes: true,
    });
    for (const entry of routeEntries) {
      if (
        !entry.isFile() ||
        (!entry.name.endsWith(".caddy") && !entry.name.endsWith(".tmp")) ||
        activeRouteNames.has(entry.name)
      ) {
        continue;
      }
      await rm(join(this.config.caddyRoutesDir, entry.name), { force: true });
      result.removedRoutes += 1;
    }
    if (result.removedRoutes > 0) {
      await this.process(
        "docker",
        [
          "exec",
          this.config.caddyContainer,
          "caddy",
          "reload",
          "--config",
          "/etc/caddy/Caddyfile",
        ],
        options(30_000),
      );
    }

    return result;
  }

  private async listManagedContainers(): Promise<string[]> {
    const listed = await this.process(
      "docker",
      [
        "ps",
        "--all",
        "--no-trunc",
        "--filter",
        "label=redner.managed=true",
        "--format",
        "{{.ID}}",
      ],
      options(30_000),
    );
    return listed.stdout.split(/\r?\n/).filter((value) => value !== "");
  }

  private async inspectContainer(
    containerId: string,
  ): Promise<{ running: boolean } | null> {
    return this.process(
      "docker",
      ["inspect", "--format", "{{.State.Running}}", containerId],
      options(30_000),
    ).then((inspection) => ({ running: inspection.stdout.trim() === "true" }))
      .catch(() => null);
  }
}

function options(timeoutMs: number) {
  return { timeoutMs, maxLines: 500, maxLineLength: 2_000 };
}
