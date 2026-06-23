import {
  Prisma,
  type DatabaseClient,
  type Project as DatabaseProject,
} from "@redner/database";
import type { CreateProjectInput, Project } from "@redner/shared";

export type DeleteProjectResult =
  | "deleted"
  | "cleanup_required"
  | "not_found"
  | "conflict";

export interface ProjectStore {
  create(input: CreateProjectInput): Promise<Project>;
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | null>;
  deleteIfInactive(id: string): Promise<DeleteProjectResult>;
}

export class DuplicateProjectSlugError extends Error {}

function serializeProject(project: DatabaseProject): Project {
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export class PrismaProjectStore implements ProjectStore {
  constructor(private readonly database: DatabaseClient) {}

  async create(input: CreateProjectInput): Promise<Project> {
    try {
      const project = await this.database.project.create({ data: input });
      return serializeProject(project);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DuplicateProjectSlugError(input.slug);
      }

      throw error;
    }
  }

  async list(): Promise<Project[]> {
    const projects = await this.database.project.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return projects.map(serializeProject);
  }

  async findById(id: string): Promise<Project | null> {
    const project = await this.database.project.findUnique({ where: { id } });
    return project === null ? null : serializeProject(project);
  }

  async deleteIfInactive(id: string): Promise<DeleteProjectResult> {
    const project = await this.database.project.findUnique({
      where: { id },
      select: {
        activeDeploymentId: true,
        status: true,
        deployments: {
          where: {
            status: {
              in: [
                "queued",
                "cloning",
                "building",
                "starting",
                "cancelling",
              ],
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (project === null) {
      return "not_found";
    }

    if (project.activeDeploymentId !== null) {
      return project.status === "stopped" ? "cleanup_required" : "conflict";
    }

    if (project.deployments.length > 0) {
      return "conflict";
    }

    try {
      await this.database.project.delete({ where: { id } });
      return "deleted";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return "not_found";
      }

      throw error;
    }
  }
}
