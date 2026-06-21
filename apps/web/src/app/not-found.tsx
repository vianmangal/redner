import Link from "next/link";

export default function NotFound() {
  return (
    <section className="rounded-2xl border border-line bg-panel p-10 text-center shadow-sm">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Project not found</h1>
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
