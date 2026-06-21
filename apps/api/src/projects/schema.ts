import { z } from "zod";

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const branchPattern = /^[A-Za-z0-9._/-]+$/;

const githubRepositoryUrl = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    segments.length !== 2
  ) {
    context.addIssue({
      code: "custom",
      message: "Use a public HTTPS GitHub repository URL",
    });
  }
});

const gitBranch = z
  .string()
  .trim()
  .min(1, "Branch is required")
  .max(255, "Branch must be 255 characters or fewer")
  .regex(branchPattern, "Branch contains unsupported characters")
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.startsWith(".") &&
      !value.endsWith(".") &&
      !value.includes("..") &&
      !value.includes("//") &&
      !value.includes("@{"),
    "Branch is not a valid Git reference",
  );

export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name is required")
      .max(100, "Project name must be 100 characters or fewer"),
    slug: z
      .string()
      .trim()
      .regex(slugPattern, "Use lowercase letters, numbers, and single hyphens"),
    repoUrl: githubRepositoryUrl,
    branch: gitBranch,
    appPort: z.coerce
      .number()
      .int("App port must be an integer")
      .min(1, "App port must be at least 1")
      .max(65_535, "App port must be at most 65535"),
  })
  .strict();

export const projectIdSchema = z.string().trim().min(1);
