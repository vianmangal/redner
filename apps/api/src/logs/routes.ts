import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type {
  DeploymentLogListener,
  DeploymentLogSubscriber,
} from "@redner/queue";
import type { DeploymentLog } from "@redner/shared";

import { ApiError } from "../errors.js";
import { projectIdSchema } from "../projects/schema.js";
import type { DeploymentLogStore } from "./store.js";

const paginationSchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function registerDeploymentLogRoutes(
  app: FastifyInstance,
  logs: DeploymentLogStore,
  subscriber: DeploymentLogSubscriber,
): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: { after?: string; limit?: string };
  }>("/deployments/:id/logs", async (request) => {
    const deploymentId = parseDeploymentId(request.params.id);
    const pagination = paginationSchema.safeParse(request.query);
    if (!pagination.success) {
      throw new ApiError(400, "INVALID_LOG_CURSOR", "Invalid log pagination values");
    }
    if (!(await logs.deploymentExists(deploymentId))) {
      throw new ApiError(404, "DEPLOYMENT_NOT_FOUND", "Deployment not found");
    }

    const entries = await logs.listAfter(
      deploymentId,
      pagination.data.after,
      pagination.data.limit,
    );
    return {
      logs: entries,
      nextSequence: entries.at(-1)?.sequence ?? pagination.data.after,
    };
  });

  app.get<{
    Params: { id: string };
    Querystring: { after?: string };
  }>("/deployments/:id/logs/stream", async (request, reply) => {
    const deploymentId = parseDeploymentId(request.params.id);
    if (!(await logs.deploymentExists(deploymentId))) {
      throw new ApiError(404, "DEPLOYMENT_NOT_FOUND", "Deployment not found");
    }

    const headerCursor = request.headers["last-event-id"];
    const cursor = parseCursor(
      typeof headerCursor === "string" ? headerCursor : request.query.after,
    );
    const buffered: DeploymentLog[] = [];
    let streaming = false;
    let lastSent = cursor;
    const listener: DeploymentLogListener = (log) => {
      if (!streaming) buffered.push(log);
      else if (log.sequence > lastSent && !reply.raw.destroyed) {
        writeLog(reply, log);
        lastSent = log.sequence;
      }
    };
    const unsubscribe = await subscriber.subscribe(deploymentId, listener);

    try {
      const responseHeaders = reply.getHeaders();
      reply.hijack();
      for (const [name, value] of Object.entries(responseHeaders)) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("cache-control", "no-cache, no-transform");
      reply.raw.setHeader("connection", "keep-alive");
      reply.raw.setHeader("x-accel-buffering", "no");
      reply.raw.writeHead(200);
      reply.raw.write("retry: 2000\n\n");

      while (true) {
        const backlog = await logs.listAfter(deploymentId, lastSent, 500);
        for (const log of backlog) {
          writeLog(reply, log);
          lastSent = log.sequence;
        }
        if (backlog.length < 500) break;
      }

      streaming = true;
      for (const log of buffered.sort((left, right) => left.sequence - right.sequence)) {
        if (log.sequence > lastSent) {
          writeLog(reply, log);
          lastSent = log.sequence;
        }
      }

      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
      }, 15_000);
      request.raw.once("close", () => {
        clearInterval(heartbeat);
        void unsubscribe().catch(() => undefined);
      });
    } catch (error) {
      await unsubscribe();
      throw error;
    }
  });
}

function parseDeploymentId(value: string): string {
  const parsed = projectIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "INVALID_DEPLOYMENT_ID", "Deployment ID is required");
  }
  return parsed.data;
}

function parseCursor(value: string | undefined): number {
  if (value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(400, "INVALID_LOG_CURSOR", "Invalid log cursor");
  }
  return parsed;
}

function writeLog(reply: FastifyReply, log: DeploymentLog): void {
  reply.raw.write(`id: ${log.sequence}\n`);
  reply.raw.write("event: log\n");
  reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
}
