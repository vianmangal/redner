import Link from "next/link";

import { ProjectForm } from "./project-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-muted transition hover:-translate-x-0.5 hover:text-ink">
        &lt;- Back to projects
      </Link>
      <div className="glass-panel-strong mt-6 rounded-[2rem] p-6 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          New project
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em]">
          Connect a repo
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          RENDER CLONE BASICALLY - make sure ur project has a dockerfile
        </p>
        <div className="mt-8">
          <ProjectForm />
        </div>
      </div>
    </div>
  );
}
