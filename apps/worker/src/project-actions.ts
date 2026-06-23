import type { Job } from "bullmq";
import type { DatabaseClient } from "@redner/database";
import type { ProjectActionJobData } from "@redner/queue";
import type { DockerContainerLifecycle } from "./container-lifecycle.js";
import type { WorkerDeploymentStore } from "./deployment-store.js";
import type { ProjectLockManager } from "./project-lock.js";
import { runProcess, type ProcessRunner } from "./process-runner.js";

export function createProjectActionProcessor(
  database: DatabaseClient,
  deployments: WorkerDeploymentStore,
  locks: ProjectLockManager,
  containers: DockerContainerLifecycle,
  process: ProcessRunner = runProcess,
) {
  return async (job: Job<ProjectActionJobData>): Promise<void> => {
    const project = await database.project.findUnique({
      where: { id: job.data.projectId },
      include: { activeDeployment: true },
    });
    if (project === null) {
      if (job.data.action === "delete") return;
      throw new Error("Project does not exist");
    }

    const active = project.activeDeployment;
    if (active?.containerId === null || active?.containerId === undefined) {
      throw new Error("Project has no active container");
    }
    const lock = await locks.acquire(project.id);
    if (lock === null) throw new Error("Project already has an active operation");
    try {
      if (job.data.action === "delete") {
        await containers.remove({
          slug: project.slug,
          containerId: active.containerId,
          imageName: active.imageName,
        });
        await database.project.delete({ where: { id: project.id } });
      } else if (job.data.action === "stop") {
        await process("docker", ["stop", active.containerId], options());
        await database.project.update({ where: { id: project.id }, data: { status: "stopped" } });
        await deployments.appendSystemLog(active.id, "Project container stopped");
      } else {
        const containerStartedAt = new Date();
        await process("docker", ["start", active.containerId], options());
        const inspected = await process(
          "docker",
          ["inspect", "--format", "{{.Name}}", active.containerId],
          options(),
        );
        const containerName = inspected.stdout.trim().replace(/^\//, "");
        await containers.checkHealth(containerName, project.appPort);
        await database.project.update({ where: { id: project.id }, data: { status: "running" } });
        await deployments.appendSystemLog(active.id, "Project container restarted");
        await containers.resumeRuntimeLogs(
          active.id,
          active.containerId,
          containerStartedAt,
        );
      }
    } finally {
      await lock.release();
    }
  };
}

function options() {
  return { timeoutMs: 60_000, maxLines: 200, maxLineLength: 2_000 };
}
