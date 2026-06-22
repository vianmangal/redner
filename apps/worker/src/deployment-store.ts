import {
  Prisma,
  type DatabaseClient,
  type Deployment,
  type Log,
} from "@redner/database";
import type { DeploymentLog, LogType } from "@redner/shared";
import type { DeploymentLogPublisher } from "@redner/queue";

export interface DeploymentWorkItem {
  id: string;
  status?: Deployment["status"];
  projectId: string;
  snapshotRepoUrl: string;
  snapshotBranch: string;
  snapshotSlug: string;
  snapshotAppPort: number;
}

export interface WorkerDeploymentStore {
  load(deploymentId: string): Promise<DeploymentWorkItem | null>;
  appendSystemLog(deploymentId: string, message: string): Promise<void>;
  appendBuildLog(deploymentId: string, message: string): Promise<void>;
  appendRuntimeLog(deploymentId: string, message: string): Promise<void>;
  markCloning(deploymentId: string): Promise<void>;
  markBuilding(
    deploymentId: string,
    commitHash: string,
    imageName: string,
  ): Promise<void>;
  markStarting(deploymentId: string, containerId: string): Promise<void>;
  isCancellationRequested(deploymentId: string): Promise<boolean>;
  markCancelled(deploymentId: string): Promise<void>;
  promote(
    deploymentId: string,
    projectId: string,
    containerId: string,
  ): Promise<string | null>;
  fail(deploymentId: string, reason: string): Promise<void>;
}

export class PrismaWorkerDeploymentStore implements WorkerDeploymentStore {
  constructor(
    private readonly database: DatabaseClient,
    private readonly publisher?: DeploymentLogPublisher,
    private readonly maxRetainedLines = 5_000,
    private readonly maxLineLength = 4_000,
  ) {}

  async load(deploymentId: string): Promise<DeploymentWorkItem | null> {
    const deployment = await this.database.deployment.findUnique({
      where: { id: deploymentId },
    });
    return deployment === null ? null : toWorkItem(deployment);
  }

  async appendSystemLog(deploymentId: string, message: string): Promise<void> {
    await this.appendLog(deploymentId, "system", message);
  }

  async appendBuildLog(deploymentId: string, message: string): Promise<void> {
    await this.appendLog(deploymentId, "build", message);
  }

  async appendRuntimeLog(deploymentId: string, message: string): Promise<void> {
    await this.appendLog(deploymentId, "runtime", message);
  }

  async markCloning(deploymentId: string): Promise<void> {
    const updated = await this.database.deployment.updateMany({
      where: {
        id: deploymentId,
        status: { notIn: ["cancelling", "cancelled", "succeeded"] },
      },
      data: {
        status: "cloning",
        startedAt: new Date(),
        finishedAt: null,
        failureReason: null,
      },
    });
    ensureDeploymentCanContinue(updated.count);
  }

  async markBuilding(
    deploymentId: string,
    commitHash: string,
    imageName: string,
  ): Promise<void> {
    const updated = await this.database.deployment.updateMany({
      where: {
        id: deploymentId,
        status: { notIn: ["cancelling", "cancelled", "succeeded"] },
      },
      data: { status: "building", commitHash, imageName },
    });
    ensureDeploymentCanContinue(updated.count);
  }

  async markStarting(deploymentId: string, containerId: string): Promise<void> {
    const updated = await this.database.deployment.updateMany({
      where: {
        id: deploymentId,
        status: { notIn: ["cancelling", "cancelled", "succeeded"] },
      },
      data: { status: "starting", containerId },
    });
    ensureDeploymentCanContinue(updated.count);
  }

  async isCancellationRequested(deploymentId: string): Promise<boolean> {
    const deployment = await this.database.deployment.findUnique({
      where: { id: deploymentId },
      select: { status: true },
    });
    return deployment?.status === "cancelling" || deployment?.status === "cancelled";
  }

  async markCancelled(deploymentId: string): Promise<void> {
    const updated = await this.database.deployment.updateMany({
      where: { id: deploymentId, status: "cancelling" },
      data: {
        status: "cancelled",
        failureReason: null,
        finishedAt: new Date(),
      },
    });
    if (updated.count > 0) {
      await this.appendSystemLog(deploymentId, "Deployment cancelled");
    }
  }

  async promote(
    deploymentId: string,
    projectId: string,
    containerId: string,
  ): Promise<string | null> {
    return this.database.$transaction(async (transaction) => {
      const project = await transaction.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { activeDeployment: { select: { containerId: true } } },
      });
      const updated = await transaction.deployment.updateMany({
        where: { id: deploymentId, status: "starting" },
        data: { status: "succeeded", containerId, finishedAt: new Date() },
      });
      ensureDeploymentCanContinue(updated.count);
      await transaction.project.update({
        where: { id: projectId },
        data: { activeDeploymentId: deploymentId, status: "running" },
      });
      return project.activeDeployment?.containerId ?? null;
    });
  }

  private async appendLog(
    deploymentId: string,
    type: LogType,
    message: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const log = await this.database.$transaction(async (transaction) => {
          const latest = await transaction.log.findFirst({
            where: { deploymentId },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          const created = await transaction.log.create({
            data: {
              deploymentId,
              sequence: (latest?.sequence ?? 0) + 1,
              type,
              message: message.slice(0, this.maxLineLength),
            },
          });
          const oldestSequenceToKeep = created.sequence - this.maxRetainedLines + 1;
          if (oldestSequenceToKeep > 1) {
            await transaction.log.deleteMany({
              where: { deploymentId, sequence: { lt: oldestSequenceToKeep } },
            });
          }
          return created;
        });
        await this.publisher?.publish(serializeLog(log)).catch(() => undefined);
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
    const updated = await this.database.deployment.updateMany({
      where: {
        id: deploymentId,
        status: { notIn: ["cancelling", "cancelled", "succeeded"] },
      },
      data: {
        status: "failed",
        failureReason: reason,
        finishedAt: new Date(),
      },
    });
    if (updated.count > 0) {
      await this.appendSystemLog(deploymentId, `Deployment failed: ${reason}`);
    }
  }
}

function ensureDeploymentCanContinue(updatedCount: number): void {
  if (updatedCount === 0) throw new Error("Deployment cancellation requested");
}

function serializeLog(log: Log): DeploymentLog {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  };
}

function toWorkItem(deployment: Deployment): DeploymentWorkItem {
  return {
    id: deployment.id,
    status: deployment.status,
    projectId: deployment.projectId,
    snapshotRepoUrl: deployment.snapshotRepoUrl,
    snapshotBranch: deployment.snapshotBranch,
    snapshotSlug: deployment.snapshotSlug,
    snapshotAppPort: deployment.snapshotAppPort,
  };
}
