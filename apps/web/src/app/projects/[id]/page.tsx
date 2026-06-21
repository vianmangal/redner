import { notFound } from "next/navigation";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { ApiClientError, getProject } from "@/lib/api";

import { DeleteProjectButton } from "./delete-project-button";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project;

  try {
    project = await getProject(id);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      notFound();
    }
    throw error;
  }

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
        <DeleteProjectButton id={project.id} name={project.name} />
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

      <section className="mt-8 rounded-2xl border border-line bg-panel p-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-neutral-300">
          Configuration saved
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Deployment controls will appear here after the BullMQ queue and worker
          are implemented in Phase 4.
        </p>
      </section>
    </div>
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
    <div className="bg-panel p-5">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={`mt-2 text-sm text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
