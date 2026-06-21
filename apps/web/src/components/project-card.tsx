import type { Project } from "@redner/shared";
import Link from "next/link";

import { StatusBadge } from "./status-badge";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-2xl border border-line bg-panel p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-500 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-[-0.02em]">
            {project.name}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-muted">
            {project.slug}.localhost
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm text-muted">
        <span className="truncate">{project.branch}</span>
        <span className="font-medium text-accent transition group-hover:translate-x-0.5">
          View project -&gt;
        </span>
      </div>
    </Link>
  );
}
