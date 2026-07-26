/**
 * Process-level configuration read from the environment.
 *
 * This is outer-layer glue; only the composition root and adapters read it.
 */

const DEFAULT_ENDPOINT_FALLBACK = "https://s3.example.com";
const MIN_SECRET_LENGTH = 32;

/**
 * Returns the secret used to seal the session cookie.
 *
 * @throws Error when `SESSION_SECRET` is missing or too short; a weak secret
 * would undermine the credential-protection boundary, so we fail fast.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return secret;
}

/** Returns the default S3 endpoint prefilled on the connection form. */
export function getDefaultEndpoint(): string {
  return process.env.DEFAULT_S3_ENDPOINT ?? DEFAULT_ENDPOINT_FALLBACK;
}

/**
 * Whether the session cookie must carry the `Secure` attribute.
 *
 * Defaults to `true` in production so the credential-bearing cookie is never
 * sent over plaintext. `SESSION_COOKIE_SECURE` is an explicit escape hatch for
 * HTTP-only deployments (e.g. a NodePort reached over `http://`), where a
 * `Secure` cookie would be silently dropped by the browser and every request
 * would look unauthenticated.
 *
 * Risk: setting this to `false` transmits sealed S3 credentials over plaintext.
 * Only do so on trusted networks; prefer terminating TLS in front of the app.
 */
export function getSessionCookieSecure(): boolean {
  const raw = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === "true" || raw === "1") {
    return true;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}
