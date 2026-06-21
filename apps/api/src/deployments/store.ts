import {
  Prisma,
  type DatabaseClient,
  type Deployment as DatabaseDeployment,
} from "@redner/database";
import type { Deployment } from "@redner/shared";

const activeStatuses = ["queued", "cloning", "building", "starting"] as const;

export type CreateDeploymentResult =
  | { kind: "created"; deployment: Deployment }
  | { kind: "not_found" }
  | { kind: "conflict" };

export interface DeploymentStore {
  createQueued(projectId: string): Promise<CreateDeploymentResult>;
  listForProject(projectId: string): Promise<Deployment[] | null>;
  fail(deploymentId: string, reason: string): Promise<void>;
}

export class PrismaDeploymentStore implements DeploymentStore {
  constructor(private readonly database: DatabaseClient) {}

  async createQueued(projectId: string): Promise<CreateDeploymentResult> {
    try {
      return await this.database.$transaction(async (transaction) => {
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

        return { kind: "created", deployment: serializeDeployment(deployment) };
      });
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

  async fail(deploymentId: string, reason: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
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
      await transaction.log.create({
        data: {
          deploymentId,
          sequence: (latestLog?.sequence ?? 0) + 1,
          type: "system",
          message: `Deployment failed: ${reason}`,
        },
      });
    });
  }
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
