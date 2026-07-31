/**
 * Path prefix the application is mounted under, e.g. `/dashboard`.
 *
 * Next.js resolved this at build time and inlined it, which is why the Docker
 * image had to rewrite its own build output at start-up. The Rust server
 * injects the real value into `index.html` instead, so one build runs under any
 * prefix and the substitution machinery is gone.
 */

import { basePath } from "@/api/client";

/** Returns the mount prefix, or an empty string when mounted at the root. */
export function getBasePath(): string {
  return basePath();
}

/**
 * Returns the cookie `Path` for browser-set cookies.
 *
 * Must match what the server uses for the session cookie, so two deployments on
 * one host under different prefixes do not read each other's preferences.
 */
export function getCookiePath(): string {
  return getBasePath() || "/";
}
