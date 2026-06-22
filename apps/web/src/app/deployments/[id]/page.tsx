import Link from "next/link";
import { notFound } from "next/navigation";

import { ApiClientError, getDeployment, listDeploymentLogs } from "@/lib/api";
import { CancelDeploymentButton } from "@/components/cancel-deployment-button";

import { LogViewer } from "./log-viewer";

export const dynamic = "force-dynamic";

export default async function DeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let deployment;
  let logs;

  try {
    [deployment, logs] = await Promise.all([
      getDeployment(id),
      listDeploymentLogs(id),
    ]);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${deployment.projectId}`}
        className="inline-flex text-sm font-bold text-muted transition hover:-translate-x-0.5 hover:text-ink"
      >
        &lt;- Back to project
      </Link>
      <div className="my-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
            Deployment logs
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
            {deployment.snapshotSlug}
          </h1>
          <p className="mt-2 font-mono text-xs text-muted">{deployment.id}</p>
        </div>
        <div className="flex items-end gap-3">
          {["queued", "cloning", "building", "starting", "cancelling"].includes(
            deployment.status,
          ) && <CancelDeploymentButton id={deployment.id} />}
          <div className="glass-panel rounded-2xl px-4 py-3 text-sm">
            <span className="text-muted">Status </span>
            <strong className="capitalize text-ink">{deployment.status}</strong>
          </div>
        </div>
      </div>
      {deployment.failureReason !== null && (
        <p className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
          {deployment.failureReason}
        </p>
      )}
      <LogViewer deploymentId={deployment.id} initialLogs={logs.logs} />
    </div>
  );
}
