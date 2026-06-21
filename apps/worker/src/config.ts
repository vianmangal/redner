import { config as loadEnvironment } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootEnvironmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);

loadEnvironment({ path: rootEnvironmentFile, quiet: true });

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .url()
    .default("postgresql://redner:redner@localhost:5432/redner?schema=public"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  DEPLOYMENT_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(300_000)
    .default(30_000),
});

export type WorkerConfig = z.infer<typeof environmentSchema>;

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return environmentSchema.parse(environment);
}
