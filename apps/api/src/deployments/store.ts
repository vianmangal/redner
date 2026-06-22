import {
  Prisma,
  type DatabaseClient,
  type Deployment as DatabaseDeployment,
  type Log as DatabaseLog,
} from "@redner/database";
import type { DeploymentLogPublisher } from "@redner/queue";
import type { Deployment, DeploymentLog } from "@redner/shared";

const activeStatuses = ["queued", "cloning", "building", "starting"] as const;

export type CreateDeploymentResult =
  | { kind: "created"; deployment: Deployment }
  | { kind: "not_found" }
  | { kind: "conflict" };

export interface DeploymentStore {
  createQueued(projectId: string): Promise<CreateDeploymentResult>;
  listForProject(projectId: string): Promise<Deployment[] | null>;
  findById(deploymentId: string): Promise<Deployment | null>;
  fail(deploymentId: string, reason: string): Promise<void>;
}

export class PrismaDeploymentStore implements DeploymentStore {
  constructor(
    private readonly database: DatabaseClient,
    private readonly publisher?: DeploymentLogPublisher,
  ) {}

  async createQueued(projectId: string): Promise<CreateDeploymentResult> {
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { id: projectId },
        });

        if (project === null) {
          return { kind: "not_found" } as const;
        }

        const active = await transaction.deployment.findFirst({
          where: { projectId, status: { in: [...activeStatuses] } },
          select: { id: true },
        });

        if (active !== null) {
          return { kind: "conflict" } as const;
        }

        const deployment = await transaction.deployment.create({
          data: {
            projectId,
            snapshotRepoUrl: project.repoUrl,
            snapshotBranch: project.branch,
            snapshotSlug: project.slug,
            snapshotAppPort: project.appPort,
            logs: {
              create: {
                sequence: 1,
                type: "system",
                message: "Deployment queued",
              },
            },
          },
        });

        return {
          kind: "created",
          deployment: serializeDeployment(deployment),
        } as const;
      });
      if (result.kind === "created") {
        const queuedLog = await this.database.log.findUnique({
          where: {
            deploymentId_sequence: {
              deploymentId: result.deployment.id,
              sequence: 1,
            },
          },
        });
        if (queuedLog !== null) {
          await this.publisher?.publish(serializeLog(queuedLog)).catch(() => undefined);
        }
      }
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { kind: "conflict" };
      }
      throw error;
    }
  }

  async listForProject(projectId: string): Promise<Deployment[] | null> {
    const project = await this.database.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (project === null) {
      return null;
    }

    const deployments = await this.database.deployment.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return deployments.map(serializeDeployment);
  }

  async findById(deploymentId: string): Promise<Deployment | null> {
    const deployment = await this.database.deployment.findUnique({
      where: { id: deploymentId },
    });
    return deployment === null ? null : serializeDeployment(deployment);
  }

  async fail(deploymentId: string, reason: string): Promise<void> {
    const log = await this.database.$transaction(async (transaction) => {
      const latestLog = await transaction.log.findFirst({
        where: { deploymentId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });

      await transaction.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "failed",
          failureReason: reason,
          finishedAt: new Date(),
        },
      });
      return transaction.log.create({
        data: {
          deploymentId,
          sequence: (latestLog?.sequence ?? 0) + 1,
          type: "system",
          message: `Deployment failed: ${reason}`,
        },
      });
    });
    await this.publisher?.publish(serializeLog(log)).catch(() => undefined);
  }
}

function serializeLog(log: DatabaseLog): DeploymentLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}

function serializeDeployment(deployment: DatabaseDeployment): Deployment {
  return {
    ...deployment,
    startedAt: deployment.startedAt?.toISOString() ?? null,
    finishedAt: deployment.finishedAt?.toISOString() ?? null,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  };
}
