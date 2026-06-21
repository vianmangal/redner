import Link from "next/link";

export default function NotFound() {
  return (
    <section className="glass-panel-strong mx-auto max-w-2xl rounded-[2rem] p-10 text-center">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Project not found</h1>
      <p className="mt-2 text-sm text-muted">
        It may have been deleted or the address may be incorrect.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex text-sm font-semibold text-accent hover:text-accent-dark"
      >
        Back to projects
      </Link>
    </section>
  );
}
