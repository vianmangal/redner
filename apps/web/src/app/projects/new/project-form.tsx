"use client";

import type { ApiErrorDetail, CreateProjectInput } from "@redner/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { ApiClientError, createProject } from "@/lib/api";
import { applicationBaseDomain } from "@/lib/application-url";

const initialForm = {
  name: "",
  slug: "",
  repoUrl: "",
  branch: "main",
  appPort: "3000",
};

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function ProjectForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ApiErrorDetail[]>([]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: slugFromName(value) } : {}),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setDetails([]);

    const input: CreateProjectInput = {
      name: form.name,
      slug: form.slug,
      repoUrl: form.repoUrl,
      branch: form.branch,
      appPort: Number(form.appPort),
    };

    try {
      const project = await createProject(input);
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setDetails(caught.response.error.details ?? []);
      } else {
        setError("The API could not be reached. Check that it is running.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string) =>
    details.find((detail) => detail.field === field)?.message;

  return (
    <form onSubmit={submit} className="space-y-6">
      {error !== null && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">{error}</p>
          {details.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-rose-700">
              {details.map((detail) => (
                <li key={`${detail.field}-${detail.message}`}>{detail.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Field id="name" label="Project name" error={fieldError("name")}>
        <input
          id="name"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          placeholder="Todo API"
          required
          maxLength={100}
          className="field-input"
        />
      </Field>

      <Field
        id="slug"
        label="Project slug"
        hint="Used for the local hostname"
        error={fieldError("slug")}
      >
        <div className="flex rounded-2xl border border-white/55 bg-slate-100/55 shadow-[inset_0_1px_0_rgb(255_255_255/0.78),0_10px_30px_rgb(51_65_85/0.08)] backdrop-blur-2xl transition focus-within:border-blue-300/80 focus-within:bg-slate-50/75 focus-within:ring-4 focus-within:ring-blue-200/40">
          <input
            id="slug"
            value={form.slug}
            onChange={(event) => {
              setSlugEdited(true);
              update("slug", event.target.value);
            }}
            placeholder="todo-api"
            required
            maxLength={63}
            className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 text-sm outline-none placeholder:text-slate-400"
          />
          <span className="flex items-center border-l border-white/55 bg-slate-300/25 px-3 text-xs font-medium text-muted">
            .{applicationBaseDomain}
          </span>
        </div>
      </Field>

      <Field
        id="repoUrl"
        label="GitHub repository"
        error={fieldError("repoUrl")}
      >
        <input
          id="repoUrl"
          type="url"
          value={form.repoUrl}
          onChange={(event) => update("repoUrl", event.target.value)}
          placeholder="https://github.com/you/todo-api.git"
          required
          className="field-input font-mono"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="branch" label="Branch" error={fieldError("branch")}>
          <input
            id="branch"
            value={form.branch}
            onChange={(event) => update("branch", event.target.value)}
            required
            maxLength={255}
            className="field-input font-mono"
          />
        </Field>
        <Field
          id="appPort"
          label="Application port"
          error={fieldError("appPort")}
        >
          <input
            id="appPort"
            type="number"
            min={1}
            max={65535}
            value={form.appPort}
            onChange={(event) => update("appPort", event.target.value)}
            required
            className="field-input font-mono"
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-white/60 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-white/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgb(40_84_197/0.24)] transition hover:-translate-y-0.5 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create project"}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {hint !== undefined && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
      {error !== undefined && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
