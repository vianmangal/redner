import { PrismaPg } from "@prisma/adapter-pg";
import type { WorkspaceInfo } from "@redner/shared";

import { PrismaClient } from "./generated/prisma/client.js";

export { Prisma } from "./generated/prisma/client.js";
export type {
  Deployment,
  Log,
  Project,
} from "./generated/prisma/client.js";

export const workspace: WorkspaceInfo = {
  name: "database",
  kind: "package",
};

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });

  return new PrismaClient({ adapter });
}

export async function checkDatabase(client: DatabaseClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

export * from "./generated/prisma/enums.js";
export * from "./generated/prisma/models.js";
