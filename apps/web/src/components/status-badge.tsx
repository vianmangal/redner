import type { ProjectStatus } from "@redner/shared";

const colors: Record<ProjectStatus, string> = {
  idle: "border-white/80 bg-white/55 text-slate-600",
  running: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
  unhealthy: "border-amber-200/80 bg-amber-50/70 text-amber-700",
  stopped: "border-rose-200/80 bg-rose-50/70 text-rose-700",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] shadow-sm backdrop-blur-lg ${colors[status]}`}
    >
      {status}
    </span>
  );
}
