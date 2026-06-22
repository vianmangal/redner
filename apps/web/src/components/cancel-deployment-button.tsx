"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, cancelDeployment } from "@/lib/api";

export function CancelDeploymentButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelDeployment(id);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The API could not be reached.",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      {confirming ? (
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-3 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-medium text-rose-800">
            Cancel this build? The running version will stay online.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={cancelling}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/75"
            >
              Keep building
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {cancelling ? "Cancelling..." : "Confirm cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-2xl border border-rose-200/80 bg-rose-50/75 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100/80"
        >
          Cancel deployment
        </button>
      )}
      {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
