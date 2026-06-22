"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, cancelDeployment } from "@/lib/api";

export function CancelDeploymentButton({ id }: { id: string }) {
  const router = useRouter();
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
      <button
        type="button"
        onClick={cancel}
        disabled={cancelling}
        className="rounded-2xl border border-rose-200/80 bg-rose-50/75 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100/80 disabled:opacity-50"
      >
        {cancelling ? "Cancelling..." : "Cancel deployment"}
      </button>
      {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
