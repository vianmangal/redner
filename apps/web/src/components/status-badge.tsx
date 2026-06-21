import type { ProjectStatus } from "@redner/shared";

const colors: Record<ProjectStatus, string> = {
  idle: "border-neutral-700 bg-neutral-900 text-neutral-400",
  running: "border-emerald-900 bg-emerald-950/50 text-emerald-400",
  unhealthy: "border-amber-900 bg-amber-950/50 text-amber-400",
  stopped: "border-red-900 bg-red-950/50 text-red-400",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${colors[status]}`}
    >
      {status}
    </span>
  );
}
