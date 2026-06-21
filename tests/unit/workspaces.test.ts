import assert from "node:assert/strict";
import test from "node:test";

import { workspace as api } from "@redner/api";
import { workspace as database } from "@redner/database";
import { workspace as queue } from "@redner/queue";
import {
  DEPLOYMENT_STATUSES,
  PROJECT_STATUSES,
  REDNER_NAME,
} from "@redner/shared";
import { workspace as web } from "@redner/web";
import { workspace as worker } from "@redner/worker";

test("redner workspaces and shared statuses resolve", () => {
  assert.equal(REDNER_NAME, "redner");
  assert.deepEqual(
    [web.name, api.name, worker.name, database.name, queue.name],
    ["web", "api", "worker", "database", "queue"],
  );
  assert.deepEqual(PROJECT_STATUSES, [
    "idle",
    "running",
    "unhealthy",
    "stopped",
  ]);
  assert.deepEqual(DEPLOYMENT_STATUSES, [
    "queued",
    "cloning",
    "building",
    "starting",
    "succeeded",
    "failed",
  ]);
});
