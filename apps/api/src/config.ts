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
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z
    .url()
    .default("postgresql://redner:redner@localhost:5432/redner?schema=public"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export type ApiConfig = z.infer<typeof environmentSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  return environmentSchema.parse(environment);
}
