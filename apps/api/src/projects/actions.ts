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
    app.post<{ Params: { id: string } }>(`/projects/:id/${action}`, async (request, reply) => {
      const parsed = projectIdSchema.safeParse(request.params.id);
      if (!parsed.success) throw new ApiError(400, "INVALID_PROJECT_ID", "Project ID is required");
      if (await projects.findById(parsed.data) === null) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
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
    });
  }
}
