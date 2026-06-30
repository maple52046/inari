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
