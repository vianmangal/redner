import type { WorkspaceInfo } from "@redner/shared";

export const workspace: WorkspaceInfo = {
  name: "api",
  kind: "application",
};

export { buildApp } from "./app.js";
export { loadConfig } from "./config.js";
export { createDependencies } from "./dependencies.js";
export { ApiError } from "./errors.js";
export {
  PrismaDeploymentStore,
  type CreateDeploymentResult,
  type DeploymentStore,
} from "./deployments/store.js";
export {
  PrismaDeploymentLogStore,
  type DeploymentLogStore,
} from "./logs/store.js";
export {
  DuplicateProjectSlugError,
  type DeleteProjectResult,
  type ProjectStore,
} from "./projects/store.js";
export type {
  AppDependencies,
  DependencyCheck,
  DependencyName,
} from "./dependencies.js";
