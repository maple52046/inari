/**
 * Path prefix the application is mounted under, e.g. `/dashboard`.
 *
 * Next.js resolves `basePath` at build time and inlines it into the client
 * bundles, so the value can never be read from the environment at start-up.
 * These helpers are the shared vocabulary for the two ways this project gets a
 * prefix in: a real value baked by `next.config.ts`, or a placeholder baked by
 * the Docker build and substituted by the container entrypoint.
 */

/**
 * Prefix compiled into the bundle when the real one is only known at start-up.
 *
 * The container entrypoint replaces every occurrence of this literal in the
 * build output, so it must stay a valid `basePath` (leading slash, no trailing
 * slash) and must never collide with a path a deployment would really use.
 */
export const BASE_PATH_PLACEHOLDER = "/__inari_base_path__";

/**
 * Canonicalizes an operator-supplied prefix into the form Next.js expects.
 *
 * An unset value, an empty string and `/` all mean "mounted at the root" and
 * normalize to `""`, which is what `basePath` and the router treat as absent.
 *
 * @throws Error when the value contains characters that would silently break
 * every route, rather than letting the app start with unreachable pages.
 */
export function normalizeBasePath(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  if (/[\s?#]/.test(trimmed)) {
    throw new Error(
      `Base path must not contain whitespace, "?" or "#": ${JSON.stringify(raw)}`,
    );
  }
  const rooted = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return rooted.replace(/\/+$/, "");
}
