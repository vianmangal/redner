import type { ProjectStatus } from "@redner/shared";

const colors: Record<ProjectStatus, string> = {
  idle: "border-slate-200 bg-slate-50 text-slate-600",
  running: "border-emerald-200 bg-emerald-50 text-emerald-700",
  unhealthy: "border-amber-200 bg-amber-50 text-amber-700",
  stopped: "border-rose-200 bg-rose-50 text-rose-700",
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
