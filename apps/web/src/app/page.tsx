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
      <section className="glass-panel-strong rounded-3xl border-rose-200/70 p-8">
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
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-7 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_5px_rgb(40_84_197/0.1)]" />
            Projects
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-[-0.05em] text-ink sm:text-5xl">
            Your local services
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted sm:text-base">
            Configure trusted GitHub repositories and queue deployment jobs.
            Stored and live deployment logs arrive in Phase 7.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="glass-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-accent transition hover:-translate-y-0.5 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="text-lg leading-none">+</span>
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <section className="glass-panel-strong mt-12 rounded-[2rem] px-6 py-16 text-center sm:py-20">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/80 bg-white/65 text-2xl font-light text-accent shadow-[0_12px_30px_rgb(40_84_197/0.18)] backdrop-blur-xl">
            +
          </div>
          <h2 className="mt-5 text-xl font-bold tracking-[-0.025em]">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Add a trusted public GitHub repository to create your first redner
            project.
          </p>
          <RepositoryFlow />
          <Link
            href="/projects/new"
            className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-accent transition hover:gap-3 hover:text-accent-dark"
          >
            Create the first project -&gt;
          </Link>
        </section>
      ) : (
        <section className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </section>
      )}
    </div>
  );
}

function RepositoryFlow() {
  return (
    <div aria-hidden="true" className="mx-auto mt-7 flex items-center justify-center gap-3 text-accent/65">
      <span className="glass-button flex size-10 items-center justify-center rounded-full">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 5.5h6l2 2H20v11H4z" />
          <path d="M8 12h8M8 15h5" />
        </svg>
      </span>
      <span className="tracking-[0.3em] text-accent/30">•••</span>
      <span className="glass-button flex size-10 items-center justify-center rounded-full">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 12a3 3 0 0 1-1 5.83" />
          <path d="m12 13 0 8m-3-3 3 3 3-3" />
        </svg>
      </span>
    </div>
  );
}
