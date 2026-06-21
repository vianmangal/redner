import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import { ApiError } from "./errors.js";
import { registerDeploymentRoutes } from "./deployments/routes.js";
import type {
  AppDependencies,
  DependencyName,
} from "./dependencies.js";
import { registerProjectRoutes } from "./projects/routes.js";

type DependencyStatus = "up" | "down";

export interface BuildAppOptions {
  dependencies: AppDependencies;
  webOrigin?: string;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({
  dependencies,
  webOrigin = "http://localhost:3000",
  logger = {
    level: process.env.NODE_ENV === "test" ? "silent" : "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  },
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError =
      error instanceof Error ? error : new Error("Unknown request error");
    const candidateStatusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;
    const statusCode =
      error instanceof ApiError
        ? error.statusCode
        : candidateStatusCode !== undefined && candidateStatusCode >= 400
          ? candidateStatusCode
          : 500;

    request.log.error({ err: normalizedError }, "request failed");

    return reply.status(statusCode).send({
      error: {
        code:
          error instanceof ApiError
            ? error.code
            : statusCode === 500
              ? "INTERNAL_SERVER_ERROR"
              : "REQUEST_ERROR",
        message:
          statusCode === 500
            ? "An unexpected error occurred"
            : normalizedError.message,
        ...(error instanceof ApiError && error.details !== undefined
          ? { details: error.details }
          : {}),
      },
    });
  });

  void app.register(cors, {
    origin: webOrigin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    }),
  );

  app.get("/health", async (_request, reply) => {
    const names: DependencyName[] = ["database", "redis"];
    const checks = await Promise.allSettled(
      names.map((name) => dependencies.checks[name]()),
    );

    const dependencyStatus = Object.fromEntries(
      names.map((name, index) => [
        name,
        checks[index]?.status === "fulfilled" ? "up" : "down",
      ]),
    ) as Record<DependencyName, DependencyStatus>;

    const healthy = Object.values(dependencyStatus).every(
      (status) => status === "up",
    );

    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      dependencies: dependencyStatus,
    });
  });

  void app.register(async (projectApp) =>
    registerProjectRoutes(projectApp, dependencies.projects),
  );
  void app.register(async (deploymentApp) =>
    registerDeploymentRoutes(
      deploymentApp,
      dependencies.deployments,
      dependencies.deploymentQueue,
    ),
  );

  app.addHook("onClose", async () => dependencies.close());

  return app;
}
