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
