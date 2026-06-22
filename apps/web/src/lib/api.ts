import type {
  ApiErrorResponse,
  CreateProjectInput,
  Deployment,
  DeploymentLog,
  Project,
} from "@redner/shared";

const publicApiUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"
).replace(/\/$/, "");
const internalApiUrl = (
  process.env.REDNER_INTERNAL_API_URL ?? publicApiUrl
).replace(/\/$/, "");

function apiUrl(): string {
  return typeof window === "undefined" ? internalApiUrl : publicApiUrl;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly response: ApiErrorResponse,
  ) {
    super(response.error.message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiErrorResponse;
    throw new ApiClientError(response.status, error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function listProjects(): Promise<Project[]> {
  const response = await request<{ projects: Project[] }>("/projects");
  return response.projects;
}

export async function getProject(id: string): Promise<Project> {
  const response = await request<{ project: Project }>(
    `/projects/${encodeURIComponent(id)}`,
  );
  return response.project;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const response = await request<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.project;
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>(`/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function deployProject(id: string): Promise<Deployment> {
  const response = await request<{ deployment: Deployment }>(
    `/projects/${encodeURIComponent(id)}/deploy`,
    { method: "POST" },
  );
  return response.deployment;
}

export async function cancelDeployment(id: string): Promise<void> {
  await request(`/deployments/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export async function listDeployments(id: string): Promise<Deployment[]> {
  const response = await request<{ deployments: Deployment[] }>(
    `/projects/${encodeURIComponent(id)}/deployments`,
  );
  return response.deployments;
}

export async function getDeployment(id: string): Promise<Deployment> {
  const response = await request<{ deployment: Deployment }>(
    `/deployments/${encodeURIComponent(id)}`,
  );
  return response.deployment;
}

export async function listDeploymentLogs(
  id: string,
  after = 0,
  limit = 500,
): Promise<{ logs: DeploymentLog[]; nextSequence: number }> {
  return request(
    `/deployments/${encodeURIComponent(id)}/logs?after=${after}&limit=${limit}`,
  );
}

export function deploymentLogStreamUrl(id: string, after = 0): string {
  return `${publicApiUrl}/deployments/${encodeURIComponent(id)}/logs/stream?after=${after}`;
}

export async function runProjectAction(
  id: string,
  action: "stop" | "restart",
): Promise<void> {
  await request(`/projects/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}
