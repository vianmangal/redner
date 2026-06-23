import assert from "node:assert/strict";
import test from "node:test";

import { deleteProject } from "../../apps/web/src/lib/api.js";

test("bodyless DELETE requests omit the JSON content type", async (context) => {
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(init?.method, "DELETE");
    assert.equal(init?.body, undefined);
    assert.equal(headers.has("content-type"), false);

    return new Response(null, { status: 204 });
  };

  await deleteProject("project-1");
});

test("project deletion reports asynchronous cleanup", async (context) => {
  const originalFetch = globalThis.fetch;

  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "deleting" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });

  assert.equal(await deleteProject("project-1"), "deleting");
});
