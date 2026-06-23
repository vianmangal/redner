"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiClientError, deleteProject, getProject } from "@/lib/api";

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteProject(id);
      if (result === "deleting") {
        const deleted = await waitForDeletion(id);
        if (!deleted) {
          setError(
            "Cleanup is taking longer than expected. Refresh to check its status.",
          );
          setDeleting(false);
          return;
        }
      }
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
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-3 text-left shadow-lg backdrop-blur-xl">
          <p className="text-xs font-medium text-rose-800">
            {deleting
              ? `Removing ${name}'s container, route, and history...`
              : `Delete ${name}? This cannot be undone.`}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/75"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Confirm delete"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="glass-button rounded-2xl border-rose-200/80 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-50/75"
        >
          Delete project
        </button>
      )}
      {error !== null && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

async function waitForDeletion(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      await getProject(id);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return true;
    }
  }

  return false;
}
