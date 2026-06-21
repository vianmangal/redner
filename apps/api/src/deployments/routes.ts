import type { FastifyInstance } from "fastify";

import type { DeploymentQueue } from "@redner/queue";

import { ApiError } from "../errors.js";
import { projectIdSchema } from "../projects/schema.js";
import type { DeploymentStore } from "./store.js";

function parseProjectId(value: string): string {
  const parsed = projectIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "INVALID_PROJECT_ID", "Project ID is required");
  }
  return parsed.data;
}

export async function registerDeploymentRoutes(
  app: FastifyInstance,
  deployments: DeploymentStore,
  queue: DeploymentQueue,
): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/projects/:id/deploy",
    async (request, reply) => {
      const projectId = parseProjectId(request.params.id);
      const result = await deployments.createQueued(projectId);

      if (result.kind === "not_found") {
        throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
      }
      if (result.kind === "conflict") {
        throw new ApiError(
          409,
          "DEPLOYMENT_ACTIVE",
          "This project already has an active deployment",
        );
      }

      try {
        await queue.enqueue(result.deployment.id);
      } catch {
        await deployments.fail(
          result.deployment.id,
          "The deployment queue is unavailable",
        );
        throw new ApiError(
          503,
          "QUEUE_UNAVAILABLE",
          "The deployment could not be queued",
        );
      }

      return reply.status(202).send({ deployment: result.deployment });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/projects/:id/deployments",
    async (request) => {
      const projectId = parseProjectId(request.params.id);
      const deploymentsForProject =
        await deployments.listForProject(projectId);

      if (deploymentsForProject === null) {
        throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found");
      }

      return { deployments: deploymentsForProject };
    },
  );
}
