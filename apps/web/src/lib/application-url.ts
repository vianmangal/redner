import {
  applicationHostname,
  applicationUrl,
} from "@redner/shared";

export const applicationBaseDomain =
  process.env.NEXT_PUBLIC_REDNER_BASE_DOMAIN ?? "localhost";

export function projectHostname(slug: string): string {
  return applicationHostname(slug, applicationBaseDomain);
}

export function projectUrl(slug: string): string {
  return applicationUrl(slug, applicationBaseDomain);
}
