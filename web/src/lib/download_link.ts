/** Inputs for building a direct (unsigned) object download URL. */
export interface DirectUrlInput {
  endpoint: string;
  /** Path-style addressing (`endpoint/bucket/key`) vs virtual-host. */
  forcePathStyle: boolean;
  bucket: string;
  key: string;
}

/**
 * Encodes an object key for a URL path while preserving its `/` hierarchy.
 *
 * Each segment is percent-encoded (handling spaces, CJK, and special
 * characters); the separators are kept so prefixes remain navigable.
 */
function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Builds a direct download URL from the connection endpoint, bucket, and key.
 *
 * Honors the connection's addressing style and avoids duplicate slashes from a
 * trailing `/` on the endpoint. This URL carries no credentials and only works
 * when the object allows anonymous reads.
 */
export function buildDirectUrl(input: DirectUrlInput): string {
  const base = input.endpoint.replace(/\/+$/, "");
  const encodedKey = encodeKeyPath(input.key);
  const encodedBucket = encodeURIComponent(input.bucket);

  if (input.forcePathStyle) {
    return `${base}/${encodedBucket}/${encodedKey}`;
  }

  // Virtual-host style: prepend the bucket as a subdomain of the endpoint host.
  try {
    const url = new URL(base);
    url.hostname = `${input.bucket}.${url.hostname}`;
    const origin = url.origin.replace(/\/+$/, "");
    const basePath = url.pathname.replace(/\/+$/, "");
    return `${origin}${basePath}/${encodedKey}`;
  } catch {
    // Endpoint is not a parseable absolute URL; fall back to path-style so a
    // usable link is still produced rather than throwing.
    return `${base}/${encodedBucket}/${encodedKey}`;
  }
}
