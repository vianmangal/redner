import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "worker",
  kind: "application",
};

export {
  CloneBuildExecutor,
  type CloneBuildConfig,
  type DeploymentExecutor,
} from "./clone-build.js";
export {
  DockerContainerLifecycle,
  type ContainerConfig,
  type ContainerLifecycle,
} from "./container-lifecycle.js";

export { loadWorkerConfig } from "./config.js";
export {
  PrismaWorkerDeploymentStore,
  type DeploymentWorkItem,
  type WorkerDeploymentStore,
} from "./deployment-store.js";
export { createDeploymentProcessor } from "./processor.js";
export {
  LocalDeploymentCancellationManager,
  type DeploymentCancellationHandle,
  type DeploymentCancellationManager,
} from "./deployment-cancellation.js";
export { createProjectActionProcessor } from "./project-actions.js";
export {
  DockerRuntimeLogCollector,
  type RuntimeLogCollector,
} from "./runtime-logs.js";
export {
  ProcessExecutionError,
  runProcess,
  type ProcessOutputLine,
  type ProcessResult,
  type ProcessRunner,
  type RunProcessOptions,
} from "./process-runner.js";
export {
  RedisProjectLockManager,
  type AcquiredProjectLock,
  type ProjectLockManager,
} from "./project-lock.js";
export { createWorkerRuntime, type WorkerRuntime } from "./runtime.js";
