import type { Project } from "@redner/shared";
import Link from "next/link";

import { projectHostname } from "@/lib/application-url";

import { StatusBadge } from "./status-badge";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="glass-panel group block rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:border-white/90 hover:bg-white/68 hover:shadow-[0_28px_70px_rgb(36_65_145/0.2)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold tracking-[-0.03em]">
            {project.name}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-muted">
            {projectHostname(project.slug)}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-7 flex items-center justify-between border-t border-white/60 pt-4 text-sm text-muted">
        <span className="truncate">{project.branch}</span>
        <span className="font-bold text-accent transition group-hover:translate-x-1">
          View project -&gt;
        </span>
      </div>
    </Link>
  );
}
