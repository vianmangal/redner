import assert from "node:assert/strict";
import test from "node:test";

import { workspace as api } from "@redner/api";
import { workspace as database } from "@redner/database";
import { REDNER_NAME } from "@redner/shared";
import { workspace as web } from "@redner/web";
import { workspace as worker } from "@redner/worker";

test("all redner workspaces resolve through npm workspace links", () => {
  assert.equal(REDNER_NAME, "redner");
  assert.deepEqual(
    [web.name, api.name, worker.name, database.name],
    ["web", "api", "worker", "database"],
  );
});
