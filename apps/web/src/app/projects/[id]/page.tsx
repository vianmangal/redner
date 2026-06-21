import { notFound } from "next/navigation";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import type { DeploymentStatus } from "@redner/shared";

import { ApiClientError, getProject, listDeployments } from "@/lib/api";

import { DeleteProjectButton } from "./delete-project-button";
import { DeployProjectButton } from "./deploy-project-button";

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
    ["queued", "cloning", "building", "starting"].includes(
      deployment.status,
    ),
  );

  return (
    <div>
      <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
        &lt;- Back to projects
      </Link>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
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
        <div className="flex items-start gap-3">
          <DeployProjectButton
            id={project.id}
            disabled={activeDeployment !== undefined}
          />
          <DeleteProjectButton id={project.id} name={project.name} />
        </div>
      </div>

      <section className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        <Detail label="Local hostname" value={`${project.slug}.localhost`} mono />
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

      <section className="mt-8 rounded-2xl border border-line bg-white p-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-accent">
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
              <div
                key={deployment.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
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
              </div>
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
    <div className="bg-white p-5">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={`mt-2 text-sm text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
