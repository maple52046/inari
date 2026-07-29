/**
 * Returns the trailing `/`-separated segment of an object key.
 *
 * S3 has no real directories; keys only emulate them with `/`, so the trailing
 * segment is the filename a user means when copying a "name". Empty segments
 * are skipped, so a folder-like key ending in `/` yields the folder name rather
 * than an empty string.
 *
 * @param key - Full object key.
 * @returns The filename, or `key` itself when it holds no non-empty segment.
 */
export function lastPathSegment(key: string): string {
  const segments = key.split("/").filter((segment) => segment.length > 0);
  return segments.at(-1) ?? key;
}

/** One immediate child of a prefix: either a sub-prefix or an object in it. */
export interface PrefixChild {
  /** Name relative to the prefix; sub-prefixes keep their trailing delimiter. */
  name: string;
  /** Whether the child groups further keys rather than being a single object. */
  isPrefix: boolean;
}

/**
 * Attributes an object key to the immediate child of `prefix` holding it.
 *
 * This is what lets one flat listing produce a per-child breakdown: every key is
 * walked once and folded into its top-level child, so measuring what a location
 * contains costs no more than measuring the location's total.
 *
 * @returns The child, or undefined when the key does not sit beneath the prefix,
 * or is the prefix's own folder marker and so belongs to no child.
 */
export function childOfPrefix(
  key: string,
  prefix: string,
): PrefixChild | undefined {
  if (!key.startsWith(prefix)) {
    return undefined;
  }
  const remainder = key.slice(prefix.length);
  if (remainder.length === 0) {
    return undefined;
  }
  const boundary = remainder.indexOf("/");
  if (boundary === -1) {
    return { name: remainder, isPrefix: false };
  }
  // The delimiter is kept so the name reads as a folder and matches the prefixes
  // the listing API reports.
  return { name: remainder.slice(0, boundary + 1), isPrefix: true };
}
