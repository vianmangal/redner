"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="rounded-2xl border border-red-950 bg-red-950/30 p-8">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-red-400">
        Something went wrong
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
        The page could not be loaded.
      </h1>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-black"
      >
        Try again
      </button>
    </section>
  );
}
