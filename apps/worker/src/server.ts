import { loadWorkerConfig } from "./config.js";
import { createWorkerRuntime } from "./runtime.js";

const runtime = await createWorkerRuntime(loadWorkerConfig());

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`received ${signal}; shutting down worker`);
  await runtime.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
