"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, deleteProject } from "@/lib/api";

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);

    try {
      await deleteProject(id);
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The API could not be reached.",
      );
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      {confirming ? (
        <div className="rounded-xl border border-red-950 bg-red-950/30 p-3 text-left">
          <p className="text-xs font-medium text-red-300">
            Delete {name}? This cannot be undone.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:bg-neutral-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Confirm delete"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-red-950 bg-panel px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-950/30"
        >
          Delete project
        </button>
      )}
      {error !== null && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
