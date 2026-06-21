export default function Loading() {
  return (
    <div aria-label="Loading projects" className="animate-pulse">
      <div className="h-3 w-24 rounded bg-neutral-800" />
      <div className="mt-5 h-10 w-80 max-w-full rounded bg-neutral-800" />
      <div className="mt-4 h-5 w-[32rem] max-w-full rounded bg-neutral-800" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 rounded-2xl border border-line bg-panel" />
        ))}
      </div>
    </div>
  );
}
