import { config as loadEnvironment } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

loadEnvironment({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const localDatabaseUrl =
  "postgresql://redner:redner@localhost:5432/redner?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
