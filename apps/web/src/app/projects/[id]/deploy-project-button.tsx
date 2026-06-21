"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, deployProject } from "@/lib/api";

export function DeployProjectButton({
  id,
  disabled,
}: {
  id: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deploy = async () => {
    setQueueing(true);
    setError(null);
    try {
      await deployProject(id);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The API could not be reached.",
      );
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={deploy}
        disabled={disabled || queueing}
        className="rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgb(40_84_197/0.24)] transition hover:-translate-y-0.5 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {queueing ? "Queueing..." : disabled ? "Deployment active" : "Deploy"}
      </button>
      {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
