import {
  Prisma,
  type DatabaseClient,
  type Deployment,
} from "@redner/database";

export interface DeploymentWorkItem {
  id: string;
  projectId: string;
  snapshotRepoUrl: string;
  snapshotBranch: string;
  snapshotSlug: string;
  snapshotAppPort: number;
}

export interface WorkerDeploymentStore {
  load(deploymentId: string): Promise<DeploymentWorkItem | null>;
  appendSystemLog(deploymentId: string, message: string): Promise<void>;
  fail(deploymentId: string, reason: string): Promise<void>;
}

export class PrismaWorkerDeploymentStore implements WorkerDeploymentStore {
  constructor(private readonly database: DatabaseClient) {}

  async load(deploymentId: string): Promise<DeploymentWorkItem | null> {
    const deployment = await this.database.deployment.findUnique({
      where: { id: deploymentId },
    });
    return deployment === null ? null : toWorkItem(deployment);
  }

  async appendSystemLog(deploymentId: string, message: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.database.$transaction(async (transaction) => {
          const latest = await transaction.log.findFirst({
            where: { deploymentId },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          await transaction.log.create({
            data: {
              deploymentId,
              sequence: (latest?.sequence ?? 0) + 1,
              type: "system",
              message,
            },
          });
        });
        return;
      } catch (error) {
        const sequenceConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!sequenceConflict || attempt === 3) {
          throw error;
        }
      }
    }
  }

  async fail(deploymentId: string, reason: string): Promise<void> {
    await this.database.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "failed",
        failureReason: reason,
        finishedAt: new Date(),
      },
    });
    await this.appendSystemLog(deploymentId, `Deployment failed: ${reason}`);
  }
}

function toWorkItem(deployment: Deployment): DeploymentWorkItem {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    snapshotRepoUrl: deployment.snapshotRepoUrl,
    snapshotBranch: deployment.snapshotBranch,
    snapshotSlug: deployment.snapshotSlug,
    snapshotAppPort: deployment.snapshotAppPort,
  };
}
