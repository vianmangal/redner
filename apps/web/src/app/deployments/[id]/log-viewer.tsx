"use client";

import { useEffect, useRef, useState } from "react";

import type { DeploymentLog } from "@redner/shared";

import { deploymentLogStreamUrl } from "@/lib/api";

export function LogViewer({
  deploymentId,
  initialLogs,
}: {
  deploymentId: string;
  initialLogs: DeploymentLog[];
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [connection, setConnection] = useState<"connecting" | "live" | "retrying">(
    "connecting",
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const after = initialLogs.at(-1)?.sequence ?? 0;
    const source = new EventSource(deploymentLogStreamUrl(deploymentId, after));
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection("retrying");
    source.addEventListener("log", (event) => {
      const log = JSON.parse((event as MessageEvent<string>).data) as DeploymentLog;
      setLogs((current) => {
        if ((current.at(-1)?.sequence ?? 0) >= log.sequence) return current;
        return [...current, log];
      });
    });
    return () => source.close();
  }, [deploymentId, initialLogs]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [autoScroll, logs]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-800/90 bg-slate-950 shadow-[0_28px_80px_rgb(15_23_42/0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${connection === "live" ? "bg-emerald-400" : "bg-amber-400"}`}
          />
          <span className="font-semibold capitalize">{connection}</span>
          <span className="text-slate-500">{logs.length} lines</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
          />
          Auto-scroll
        </label>
      </div>
      <div className="h-[32rem] overflow-auto p-5 font-mono text-[13px] leading-6 text-slate-200">
        {logs.length === 0 ? (
          <p className="text-slate-500">Waiting for deployment output...</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="grid grid-cols-[4rem_5rem_1fr] gap-3">
              <span className="select-none text-right text-slate-600">{log.sequence}</span>
              <span
                className={
                  log.type === "build"
                    ? "text-amber-300"
                    : log.type === "runtime"
                      ? "text-cyan-300"
                      : "text-violet-300"
                }
              >
                {log.type}
              </span>
              <span className="whitespace-pre-wrap break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
