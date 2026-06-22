import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { WorkerDeploymentStore } from "./deployment-store.js";

export interface RuntimeLogCollector {
  start(deploymentId: string, containerId: string, since: Date): Promise<void>;
  close(): Promise<void>;
}

interface ActiveLogProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  pending: Promise<void>;
}

export class DockerRuntimeLogCollector implements RuntimeLogCollector {
  private readonly active = new Map<string, ActiveLogProcess>();

  constructor(
    private readonly deployments: WorkerDeploymentStore,
    private readonly maxLineLength: number,
  ) {}

  async start(
    deploymentId: string,
    containerId: string,
    since: Date,
  ): Promise<void> {
    const existing = this.active.get(deploymentId);
    existing?.child.kill("SIGTERM");

    const child = spawn(
      "docker",
      [
        "logs",
        "--follow",
        "--since",
        since.toISOString(),
        containerId,
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    const active: ActiveLogProcess = { child, pending: Promise.resolve() };
    this.active.set(deploymentId, active);

    const enqueue = (message: string) => {
      active.pending = active.pending
        .then(() =>
          this.deployments.appendRuntimeLog(
            deploymentId,
            message.slice(0, this.maxLineLength),
          ),
        )
        .catch(() => undefined);
    };
    consumeLines(child.stdout, enqueue);
    consumeLines(child.stderr, enqueue);

    child.once("error", (error) => {
      void this.deployments
        .appendSystemLog(
          deploymentId,
          `Runtime log collection failed: ${error.message}`,
        )
        .catch(() => undefined);
    });
    child.once("close", () => {
      void active.pending.finally(() => {
        if (this.active.get(deploymentId)?.child === child) {
          this.active.delete(deploymentId);
        }
      });
    });
  }

  async close(): Promise<void> {
    const processes = [...this.active.values()];
    this.active.clear();
    for (const active of processes) active.child.kill("SIGTERM");
    await Promise.all(processes.map((active) => active.pending));
  }
}

function consumeLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): void {
  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  });
  stream.on("end", () => {
    if (buffered !== "") onLine(buffered);
  });
}
