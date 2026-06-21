import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "worker",
  kind: "application",
};

export { loadWorkerConfig } from "./config.js";
export {
  PrismaWorkerDeploymentStore,
  type DeploymentWorkItem,
  type WorkerDeploymentStore,
} from "./deployment-store.js";
export { createDeploymentProcessor } from "./processor.js";
export {
  RedisProjectLockManager,
  type AcquiredProjectLock,
  type ProjectLockManager,
} from "./project-lock.js";
export { createWorkerRuntime, type WorkerRuntime } from "./runtime.js";
