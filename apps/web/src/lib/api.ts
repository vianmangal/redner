import type {
  ApiErrorResponse,
  CreateProjectInput,
  Project,
} from "@redner/shared";

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000"
).replace(/\/$/, "");

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
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
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
