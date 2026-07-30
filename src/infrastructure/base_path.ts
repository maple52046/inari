/**
 * Reads the prefix the application is mounted under.
 *
 * `NEXT_PUBLIC_BASE_PATH` is published by `next.config.ts` and inlined into
 * both the server and the client bundles, so this module is safe to import
 * from either side. It is deliberately separate from `config.ts`: importing
 * that module from a client component would ship the secret-reading helpers
 * into the browser bundle.
 */

import { normalizeBasePath } from "@/lib/base_path";

/** Returns the mount prefix, or `""` when the app is served from the root. */
export function getBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}

/**
 * Returns the `path` attribute for cookies this deployment sets.
 *
 * Scoping cookies to the mount prefix keeps two deployments on the same host
 * from overwriting each other's session.
 */
export function getCookiePath(): string {
  return getBasePath() || "/";
}
