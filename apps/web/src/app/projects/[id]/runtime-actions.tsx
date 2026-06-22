"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiClientError, getProject, runProjectAction } from "@/lib/api";

type RuntimeAction = "stop" | "restart";

export function RuntimeActions({
  id,
  status,
  hasActive,
}: {
  id: string;
  status: string;
  hasActive: boolean;
}) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [pendingAction, setPendingAction] = useState<RuntimeAction | null>(null);
  const [completedAction, setCompletedAction] =
    useState<RuntimeAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveStatus = completedAction === "stop"
    ? "stopped"
    : completedAction === "restart"
      ? "running"
      : status;
  const action: RuntimeAction =
    effectiveStatus === "stopped" ? "restart" : "stop";
  const busy = requesting || pendingAction !== null;

  useEffect(() => {
    if (pendingAction === null) return;

    const targetStatus = pendingAction === "stop" ? "stopped" : "running";
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const project = await getProject(id);
        if (cancelled) return;

        if (project.status === targetStatus) {
          setCompletedAction(pendingAction);
          setPendingAction(null);
          router.refresh();
          return;
        }
      } catch {
        // The action is already queued; a transient polling error should not
        // turn a successful request into a failure message.
      }

      attempts += 1;
      if (attempts < 30) {
        timer = setTimeout(checkStatus, 1_000);
      } else {
        setPendingAction(null);
        setError(
          "The action is taking longer than expected. Refresh to check its status.",
        );
        router.refresh();
      }
    };

    timer = setTimeout(checkStatus, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, pendingAction, router]);

  if (!hasActive) return null;

  const run = async () => {
    setRequesting(true);
    setError(null);
    setCompletedAction(null);
    try {
      await runProjectAction(id, action);
      setPendingAction(action);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The API could not be reached.",
      );
    } finally {
      setRequesting(false);
    }
  };

  const buttonLabel = pendingAction === "stop"
    ? "Stopping..."
    : pendingAction === "restart"
      ? "Restarting..."
      : requesting
        ? "Queueing..."
        : action === "stop"
          ? "Stop"
          : "Restart";

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="glass-button rounded-2xl px-4 py-2.5 text-sm font-bold text-ink transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-65"
      >
        {buttonLabel}
      </button>
      <div aria-live="polite">
        {completedAction !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {completedAction === "stop" ? "Stopped" : "Running"}
          </p>
        )}
        {pendingAction !== null && (
          <p className="mt-2 text-xs font-medium text-muted">
            {pendingAction === "stop"
              ? "Stopping container..."
              : "Starting container..."}
          </p>
        )}
        {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
