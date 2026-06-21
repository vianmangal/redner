import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDependencies } from "./dependencies.js";

const config = loadConfig();
const dependencies = createDependencies(config);
const app = buildApp({ dependencies, webOrigin: config.WEB_ORIGIN });

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "shutting down API");
  await app.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error, "failed to start API");
  await app.close();
  process.exitCode = 1;
}
