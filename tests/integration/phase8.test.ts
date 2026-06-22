import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabaseClient } from "@redner/database";
import {
  DockerContainerLifecycle,
  PrismaWorkerDeploymentStore,
  runProcess,
} from "@redner/worker";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://redner:redner@localhost:5432/redner?schema=public";

test("two projects keep distinct stable localhost routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "redner-phase8-"));
  const database = createDatabaseClient(databaseUrl);
  const routesDir = join(process.cwd(), "data/caddy/routes");
  const stamp = Date.now();
  const fixtures = [
    { slug: `phase-eight-a-${stamp}`, response: "route-alpha", image: `redner-phase8-a:${stamp}` },
    { slug: `phase-eight-b-${stamp}`, response: "route-beta", image: `redner-phase8-b:${stamp}` },
  ];
  const projectIds: string[] = [];
  const containerIds: string[] = [];
  const store = new PrismaWorkerDeploymentStore(database);
  const lifecycle = new DockerContainerLifecycle(store, {
    proxyNetwork: "redner_proxy",
    baseDomain: "localhost",
    caddyContainer: "redner-caddy",
    caddyRoutesDir: routesDir,
    healthTimeoutMs: 20_000,
    memoryLimit: "128m",
    cpuLimit: "0.5",
    pidsLimit: 64,
  });

  try {
    await writeFile(
      join(root, "Dockerfile"),
      "FROM caddy:2-alpine\nCOPY AppCaddyfile /etc/caddy/Caddyfile\n",
    );

    for (const fixture of fixtures) {
      await writeFile(
        join(root, "AppCaddyfile"),
        `:80 {\n  respond "${fixture.response}" 200\n}\n`,
      );
      await runProcess(
        "docker",
        ["build", "--tag", fixture.image, "."],
        { ...options(), cwd: root },
      );
      const project = await database.project.create({
        data: {
          name: fixture.response,
          slug: fixture.slug,
          repoUrl: "https://github.com/example/app.git",
          branch: "main",
          appPort: 80,
        },
      });
      projectIds.push(project.id);
      const deployment = await database.deployment.create({
        data: {
          projectId: project.id,
          status: "building",
          snapshotRepoUrl: project.repoUrl,
          snapshotBranch: project.branch,
          snapshotSlug: project.slug,
          snapshotAppPort: project.appPort,
          imageName: fixture.image,
        },
      });
      await lifecycle.promote(
        {
          id: deployment.id,
          projectId: project.id,
          snapshotRepoUrl: project.repoUrl,
          snapshotBranch: project.branch,
          snapshotSlug: project.slug,
          snapshotAppPort: project.appPort,
        },
        fixture.image,
      );
      const stored = await database.deployment.findUniqueOrThrow({
        where: { id: deployment.id },
      });
      assert.ok(stored.containerId);
      containerIds.push(stored.containerId);
      const publishedPorts = await runProcess(
        "docker",
        ["port", stored.containerId],
        options(),
      );
      assert.equal(publishedPorts.stdout, "");
    }

    for (const fixture of fixtures) {
      const response = await runProcess(
        "curl",
        [
          "--fail", "--silent", "--header", `Host: ${fixture.slug}.localhost`,
          "http://127.0.0.1",
        ],
        options(),
      );
      assert.equal(response.stdout, fixture.response);
    }
  } finally {
    for (const containerId of containerIds) {
      await runProcess("docker", ["rm", "--force", containerId], options()).catch(() => undefined);
    }
    for (const fixture of fixtures) {
      await runProcess("docker", ["image", "rm", "--force", fixture.image], options()).catch(() => undefined);
      await rm(join(routesDir, `${fixture.slug}.caddy`), { force: true });
    }
    await runProcess(
      "docker",
      ["exec", "redner-caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile"],
      options(),
    ).catch(() => undefined);
    if (projectIds.length > 0) {
      await database.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await database.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});

function options() {
  return { timeoutMs: 120_000, maxLines: 500, maxLineLength: 2_000 };
}
