import Link from "next/link";

import { ProjectCard } from "@/components/project-card";
import { listProjects } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects;

  try {
    projects = await listProjects();
  } catch {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-rose-700">
          API unavailable
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
          The dashboard could not reach redner.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Start the API on port 4000, then refresh this page. PostgreSQL and Redis
          must also be healthy.
        </p>
      </section>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Projects
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-ink">
            Your local services
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            Configure trusted GitHub repositories and queue deployment jobs.
            Repository cloning and image builds arrive in Phase 5.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <section className="mt-12 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-canvas font-mono text-lg text-muted">
            +
          </div>
          <h2 className="mt-5 text-lg font-semibold">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Add a trusted public GitHub repository to create your first redner
            project.
          </p>
          <Link
            href="/projects/new"
            className="mt-6 inline-flex text-sm font-semibold text-accent hover:text-accent-dark"
          >
            Create the first project -&gt;
          </Link>
        </section>
      ) : (
        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      )}
    </div>
  );
}
