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
    .max(3_600_000)
    .default(900_000),
  REDNER_BUILD_ROOT: z.string().min(1).default("/tmp/redner"),
  CLONE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(120_000),
  BUILD_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(600_000),
  MAX_BUILD_LOG_LINES: z.coerce.number().int().min(10).default(2_000),
  MAX_LOG_LINE_LENGTH: z.coerce.number().int().min(80).default(4_000),
});

export type WorkerConfig = z.infer<typeof environmentSchema>;

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return environmentSchema.parse(environment);
}
