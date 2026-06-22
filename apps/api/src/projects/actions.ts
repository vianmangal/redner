import type { FastifyInstance } from "fastify";
import type { ProjectActionQueue } from "@redner/queue";
import { ApiError } from "../errors.js";
import { projectIdSchema } from "./schema.js";
import type { ProjectStore } from "./store.js";

export async function registerProjectActionRoutes(
  app: FastifyInstance,
  projects: ProjectStore,
  actions: ProjectActionQueue,
): Promise<void> {
  for (const action of ["stop", "restart"] as const) {
    app.post<{ Params: { id: string } }>(
      `/projects/:id/${action}`,
      async (request, reply) => {
        const parsed = projectIdSchema.safeParse(request.params.id);
        if (!parsed.success) {
          throw new ApiError(
            400,
            "INVALID_PROJECT_ID",
            "Project ID is required",
          );
        }
        const project = await projects.findById(parsed.data);
        if (project === null) {
          throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
        }
        if (project.activeDeploymentId === null) {
          throw new ApiError(
            409,
            "PROJECT_NOT_DEPLOYED",
            "The project has no active deployment",
          );
        }
        if (action === "stop" && project.status === "stopped") {
          throw new ApiError(
            409,
            "PROJECT_ALREADY_STOPPED",
            "The project is already stopped",
          );
        }
        if (action === "restart" && project.status !== "stopped") {
          throw new ApiError(
            409,
            "PROJECT_NOT_STOPPED",
            "Only a stopped project can be restarted",
          );
        }
        try {
          await actions.enqueue(parsed.data, action);
        } catch {
          throw new ApiError(
            503,
            "QUEUE_UNAVAILABLE",
            "The project action could not be queued",
          );
        }
        return reply.status(202).send({ action, status: "queued" });
      },
    );
  }
}
