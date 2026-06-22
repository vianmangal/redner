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
  "cancelling",
  "cancelled",
  "succeeded",
  "failed",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_TRIGGERS = ["manual", "restart"] as const;

export type DeploymentTrigger = (typeof DEPLOYMENT_TRIGGERS)[number];

export const LOG_TYPES = ["system", "build", "runtime"] as const;

export type LogType = (typeof LOG_TYPES)[number];

export function applicationHostname(
  slug: string,
  baseDomain: string,
): string {
  return `${slug}.${baseDomain}`;
}

export function applicationUrl(slug: string, baseDomain: string): string {
  const protocol = baseDomain === "localhost" ? "http" : "https";
  return `${protocol}://${applicationHostname(slug, baseDomain)}`;
}

export function caddyApplicationAddress(
  slug: string,
  baseDomain: string,
): string {
  return baseDomain === "localhost"
    ? applicationUrl(slug, baseDomain)
    : applicationHostname(slug, baseDomain);
}

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
