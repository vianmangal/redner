import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "../errors.js";
import { createProjectSchema, projectIdSchema } from "./schema.js";
import {
  DuplicateProjectSlugError,
  type ProjectStore,
} from "./store.js";

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

function parseProjectId(value: string): string {
  const parsed = projectIdSchema.safeParse(value);

  if (!parsed.success) {
    throw new ApiError(400, "INVALID_PROJECT_ID", "Project ID is required");
  }

  return parsed.data;
}

export async function registerProjectRoutes(
  app: FastifyInstance,
  projects: ProjectStore,
): Promise<void> {
  app.get("/projects", async () => ({ projects: await projects.list() }));

  app.post("/projects", async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid project data",
        validationDetails(parsed.error),
      );
    }

    try {
      const project = await projects.create(parsed.data);
      return reply.status(201).send({ project });
    } catch (error) {
      if (error instanceof DuplicateProjectSlugError) {
        throw new ApiError(
          409,
          "PROJECT_SLUG_CONFLICT",
          "A project with this slug already exists",
        );
      }

      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/projects/:id", async (request) => {
    const id = parseProjectId(request.params.id);
    const project = await projects.findById(id);

    if (project === null) {
      throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    return { project };
  });

  app.delete<{ Params: { id: string } }>(
    "/projects/:id",
    async (request, reply) => {
      const id = parseProjectId(request.params.id);
      const result = await projects.deleteIfInactive(id);

      if (result === "not_found") {
        throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
      }

      if (result === "conflict") {
        throw new ApiError(
          409,
          "PROJECT_ACTIVE",
          "Stop active deployment work before deleting this project",
        );
      }

      return reply.status(204).send();
    },
  );
}
