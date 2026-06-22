import { notFound } from "next/navigation";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { CancelDeploymentButton } from "@/components/cancel-deployment-button";
import type { DeploymentStatus } from "@redner/shared";

import { ApiClientError, getProject, listDeployments } from "@/lib/api";
import { projectUrl } from "@/lib/application-url";

import { DeleteProjectButton } from "./delete-project-button";
import { DeployProjectButton } from "./deploy-project-button";
import { RuntimeActions } from "./runtime-actions";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project;
  let deployments;

  try {
    [project, deployments] = await Promise.all([
      getProject(id),
      listDeployments(id),
    ]);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const activeDeployment = deployments.find((deployment) =>
    ["queued", "cloning", "building", "starting", "cancelling"].includes(
      deployment.status,
    ),
  );
  const applicationUrl = projectUrl(project.slug);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted transition hover:-translate-x-0.5 hover:text-ink">
        &lt;- Back to projects
      </Link>

      <div className="mt-7 flex flex-col gap-6 px-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
              {project.name}
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex font-mono text-sm text-accent hover:text-accent-dark"
          >
            {project.repoUrl}
          </a>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {activeDeployment !== undefined && (
            <CancelDeploymentButton id={activeDeployment.id} />
          )}
          <RuntimeActions
            id={project.id}
            status={project.status}
            hasActive={project.activeDeploymentId !== null}
          />
          <DeployProjectButton
            id={project.id}
            disabled={activeDeployment !== undefined}
          />
          <DeleteProjectButton id={project.id} name={project.name} />
        </div>
      </div>

      <section className="glass-panel mt-10 grid gap-px overflow-hidden rounded-[2rem] bg-white/35 sm:grid-cols-2">
        <div className="bg-white/45 p-5 backdrop-blur-xl">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Application URL
          </dt>
          <dd className="mt-2 text-sm">
            <a
              href={applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:text-accent-dark"
            >
              {applicationUrl}
            </a>
          </dd>
        </div>
        <Detail label="Runtime status" value={project.status} />
        <Detail label="Git branch" value={project.branch} mono />
        <Detail label="Application port" value={String(project.appPort)} mono />
        <Detail
          label="Created"
          value={new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(project.createdAt))}
        />
        <Detail
          label="Active deployment"
          value={project.activeDeploymentId ?? "Not deployed yet"}
          mono={project.activeDeploymentId !== null}
        />
      </section>

      <section className="glass-panel-strong mt-8 rounded-[2rem] p-6 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          Deployment queue
        </p>
        {deployments.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            No deployments yet. Queue one to verify the API, Redis, and worker
            handoff.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line">
            {deployments.slice(0, 5).map((deployment) => (
              <Link
                key={deployment.id}
                href={`/deployments/${deployment.id}`}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-muted">
                    {deployment.id}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(deployment.createdAt))}
                  </p>
                </div>
                <DeploymentBadge status={deployment.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const deploymentColors: Record<DeploymentStatus, string> = {
  queued: "border-blue-200 bg-blue-50 text-blue-700",
  cloning: "border-violet-200 bg-violet-50 text-violet-700",
  building: "border-amber-200 bg-amber-50 text-amber-700",
  starting: "border-cyan-200 bg-cyan-50 text-cyan-700",
  cancelling: "border-orange-200 bg-orange-50 text-orange-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

function DeploymentBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${deploymentColors[status]}`}
    >
      {status}
    </span>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-white/45 p-5 backdrop-blur-xl">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={`mt-2 text-sm text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
