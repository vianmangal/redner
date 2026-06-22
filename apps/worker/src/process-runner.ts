import { spawn } from "node:child_process";

export interface ProcessOutputLine {
  stream: "stdout" | "stderr";
  message: string;
}

export interface RunProcessOptions {
  cwd?: string;
  timeoutMs: number;
  maxLines: number;
  maxLineLength: number;
  signal?: AbortSignal;
  onLine?: (line: ProcessOutputLine) => Promise<void>;
}

export interface ProcessResult {
  stdout: string;
}

export type ProcessRunner = typeof runProcess;

export class ProcessExecutionError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
    readonly cancelled = false,
  ) {
    super(message);
    this.name = "ProcessExecutionError";
  }
}

export async function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ProcessExecutionError(`${command} was cancelled`, false, true));
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let lineCount = 0;
    let outputTruncated = false;
    let timedOut = false;
    let cancelled = false;
    let loggingError: unknown;
    let logChain = Promise.resolve();

    const queueLine = (stream: ProcessOutputLine["stream"], value: string) => {
      if (value === "") return;
      if (lineCount >= options.maxLines) {
        if (!outputTruncated) {
          outputTruncated = true;
          logChain = logChain.then(() =>
            options.onLine?.({
              stream: "stderr",
              message: `[output truncated after ${options.maxLines} lines]`,
            }),
          );
        }
        return;
      }

      lineCount += 1;
      const message = value.slice(0, options.maxLineLength);
      logChain = logChain
        .then(() => options.onLine?.({ stream, message }))
        .catch((error) => {
          loggingError = error;
          child.kill("SIGTERM");
        });
    };

    const consume = (
      stream: ProcessOutputLine["stream"],
      chunk: Buffer,
    ) => {
      if (stream === "stdout" && stdout.length < 65_536) {
        stdout += chunk.toString("utf8").slice(0, 65_536 - stdout.length);
      }
      const combined =
        (stream === "stdout" ? stdoutBuffer : stderrBuffer) +
        chunk.toString("utf8");
      const lines = combined.split(/\r?\n/);
      const remainder = lines.pop() ?? "";
      if (stream === "stdout") stdoutBuffer = remainder;
      else stderrBuffer = remainder;
      for (const line of lines) queueLine(stream, line);
    };

    child.stdout.on("data", (chunk: Buffer) => consume("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => consume("stderr", chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, options.timeoutMs);
    timeout.unref();

    const cancel = () => {
      cancelled = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    };
    options.signal?.addEventListener("abort", cancel, { once: true });

    child.once("error", (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
      reject(new ProcessExecutionError(`Could not start ${command}: ${error.message}`));
    });

    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
      queueLine("stdout", stdoutBuffer);
      queueLine("stderr", stderrBuffer);
      void logChain.then(() => {
        if (loggingError !== undefined) {
          reject(loggingError);
        } else if (cancelled) {
          reject(new ProcessExecutionError(`${command} was cancelled`, false, true));
        } else if (timedOut) {
          reject(
            new ProcessExecutionError(
              `${command} timed out after ${options.timeoutMs}ms`,
              true,
            ),
          );
        } else if (code !== 0) {
          reject(
            new ProcessExecutionError(
              `${command} exited with ${code ?? signal ?? "unknown status"}`,
            ),
          );
        } else {
          resolve({ stdout });
        }
      });
    });
  });
}
