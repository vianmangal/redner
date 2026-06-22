import type { FastifyInstance } from "fastify";

import type {
  DeploymentCancellationPublisher,
  DeploymentQueue,
} from "@redner/queue";

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
  cancellations: DeploymentCancellationPublisher,
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

  app.get<{ Params: { id: string } }>(
    "/deployments/:id",
    async (request) => {
      const deploymentId = parseProjectId(request.params.id);
      const deployment = await deployments.findById(deploymentId);
      if (deployment === null) {
        throw new ApiError(404, "DEPLOYMENT_NOT_FOUND", "Deployment not found");
      }
      return { deployment };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/deployments/:id/cancel",
    async (request, reply) => {
      const deploymentId = parseProjectId(request.params.id);
      const result = await deployments.requestCancellation(deploymentId);
      if (result.kind === "not_found") {
        throw new ApiError(404, "DEPLOYMENT_NOT_FOUND", "Deployment not found");
      }
      if (result.kind === "not_active") {
        throw new ApiError(
          409,
          "DEPLOYMENT_NOT_ACTIVE",
          "Only an active deployment can be cancelled",
        );
      }

      const removed = await queue.cancelWaiting(deploymentId).catch(() => false);
      const signalled = await cancellations
        .publish(deploymentId)
        .then(() => true)
        .catch(() => false);
      if (removed) await deployments.markCancelled(deploymentId);
      if (!removed && !signalled) {
        throw new ApiError(
          503,
          "CANCELLATION_UNAVAILABLE",
          "The cancellation signal could not be delivered; retry the request",
        );
      }

      return reply.status(202).send({
        deploymentId,
        status: removed ? "cancelled" : "cancelling",
      });
    },
  );
}
