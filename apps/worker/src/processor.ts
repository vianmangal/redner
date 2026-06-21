import type { Job } from "bullmq";

import type { DeploymentJobData } from "@redner/queue";

import type { WorkerDeploymentStore } from "./deployment-store.js";
import type { ProjectLockManager } from "./project-lock.js";

export function createDeploymentProcessor(
  deployments: WorkerDeploymentStore,
  locks: ProjectLockManager,
): (job: Job<DeploymentJobData>) => Promise<void> {
  return async (job) => {
    const deployment = await deployments.load(job.data.deploymentId);
    if (deployment === null) {
      throw new Error(`Deployment ${job.data.deploymentId} was not found`);
    }

    try {
      const lock = await locks.acquire(deployment.projectId);
      if (lock === null) {
        throw new Error("Another deployment is already running for this project");
      }

      try {
        await deployments.appendSystemLog(
          deployment.id,
          `Worker accepted deployment attempt ${job.attemptsMade + 1}`,
        );
        await deployments.appendSystemLog(
          deployment.id,
          `Configuration loaded for ${deployment.snapshotSlug} from PostgreSQL`,
        );
        await deployments.appendSystemLog(
          deployment.id,
          "Queue handoff complete; clone and build continue in Phase 5",
        );
      } finally {
        await lock.release();
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown worker error";
      const configuredAttempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= configuredAttempts;

      if (finalAttempt) {
        await deployments.fail(deployment.id, reason);
      } else {
        await deployments.appendSystemLog(
          deployment.id,
          `Worker attempt ${job.attemptsMade + 1} failed: ${reason}`,
        );
      }
      throw error;
    }
  };
}
