"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, runProjectAction } from "@/lib/api";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasActive) return null;
  const action = status === "stopped" ? "restart" : "stop";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await runProjectAction(id, action);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The API could not be reached.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="glass-button rounded-2xl px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-50"
      >
        {busy ? "Queueing..." : action === "stop" ? "Stop" : "Restart"}
      </button>
      {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
