import Link from "next/link";

import { ProjectForm } from "./project-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
        &lt;- Back to projects
      </Link>
      <div className="mt-6 rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          New project
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Connect a repository
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Use a trusted public GitHub repository with a Dockerfile. Redner will
          only save its configuration in this phase.
        </p>
        <div className="mt-8">
          <ProjectForm />
        </div>
      </div>
    </div>
  );
}
