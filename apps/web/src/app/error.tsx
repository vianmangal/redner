"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="glass-panel-strong rounded-3xl border-rose-200/70 p-8">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-rose-700">
        Something went wrong
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
        The page could not be loaded.
      </h1>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-2xl bg-ink px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
      >
        Try again
      </button>
    </section>
  );
}
