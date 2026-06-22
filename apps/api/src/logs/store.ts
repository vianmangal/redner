import type { DatabaseClient, Log as DatabaseLog } from "@redner/database";
import type { DeploymentLog } from "@redner/shared";

export interface DeploymentLogStore {
  deploymentExists(deploymentId: string): Promise<boolean>;
  listAfter(
    deploymentId: string,
    afterSequence: number,
    limit: number,
  ): Promise<DeploymentLog[]>;
}

export class PrismaDeploymentLogStore implements DeploymentLogStore {
  constructor(private readonly database: DatabaseClient) {}

  async deploymentExists(deploymentId: string): Promise<boolean> {
    return (await this.database.deployment.count({ where: { id: deploymentId } })) > 0;
  }

  async listAfter(
    deploymentId: string,
    afterSequence: number,
    limit: number,
  ): Promise<DeploymentLog[]> {
    const logs = await this.database.log.findMany({
      where: { deploymentId, sequence: { gt: afterSequence } },
      orderBy: { sequence: "asc" },
      take: limit,
    });
    return logs.map(serializeLog);
  }
}

function serializeLog(log: DatabaseLog): DeploymentLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}
