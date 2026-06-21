export interface WorkspaceInfo {
  name: string;
  kind: "application" | "package";
}

export const REDNER_NAME = "redner";

export const PROJECT_STATUSES = [
  "idle",
  "running",
  "unhealthy",
  "stopped",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const DEPLOYMENT_STATUSES = [
  "queued",
  "cloning",
  "building",
  "starting",
  "succeeded",
  "failed",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_TRIGGERS = ["manual", "restart"] as const;

export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number];

export const LOG_TYPES = ["system", "build", "runtime"] as const;

export type LogType = (typeof LOG_TYPES)[number];

export interface DeploymentConfigSnapshot {
  repoUrl: string;
  branch: string;
  slug: string;
  appPort: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  repoUrl: string;
  branch: string;
  appPort: number;
  status: ProjectStatus;
  activeDeploymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  slug: string;
  repoUrl: string;
  branch: string;
  appPort: number;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  trigger: DeploymentTrigger;
  snapshotRepoUrl: string;
  snapshotBranch: string;
  snapshotSlug: string;
  snapshotAppPort: number;
  commitHash: string | null;
  imageName: string | null;
  containerId: string | null;
  failureReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  sequence: number;
  type: LogType;
  message: string;
  createdAt: string;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}
