import { config as loadEnvironment } from "dotenv";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootEnvironmentFile = fileURLToPath(
  new URL("../../../.env", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

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
  MAX_RETAINED_LOG_LINES: z.coerce.number().int().min(100).default(5_000),
  REDNER_PROXY_NETWORK: z.string().min(1).default("redner_proxy"),
  REDNER_BASE_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/,
      "REDNER_BASE_DOMAIN must be localhost or a valid domain",
    )
    .default("localhost"),
  REDNER_CADDY_CONTAINER: z.string().min(1).default("redner-caddy"),
  REDNER_CADDY_ROUTES_DIR: z.string().min(1).default("./data/caddy/routes"),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(60_000),
  CONTAINER_MEMORY_LIMIT: z.string().min(1).default("512m"),
  CONTAINER_CPU_LIMIT: z.string().min(1).default("1"),
  CONTAINER_PIDS_LIMIT: z.coerce.number().int().min(16).default(128),
});

export type WorkerConfig = z.infer<typeof environmentSchema>;

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const config = environmentSchema.parse(environment);
  return {
    ...config,
    REDNER_CADDY_ROUTES_DIR: isAbsolute(config.REDNER_CADDY_ROUTES_DIR)
      ? config.REDNER_CADDY_ROUTES_DIR
      : resolve(repositoryRoot, config.REDNER_CADDY_ROUTES_DIR),
  };
}
