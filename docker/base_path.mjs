// Start-up substitution of the base path baked into the build output.
//
// Next.js inlines `basePath` into the client bundles and into the standalone
// server.js, so it cannot be configured when the server starts. The image is
// therefore built with a placeholder prefix and this module rewrites it to the
// operator's BASE_PATH before the server is loaded, so one image serves any
// prefix.
//
// Plain ESM on purpose: the entrypoint runs in a distroless image with no
// TypeScript toolchain, so it cannot share src/lib/base_path.ts. The
// duplication of `normalizeBasePath` is guarded by base_path.test.mjs, which
// asserts both implementations agree.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Must stay in sync with `BASE_PATH_PLACEHOLDER` in `src/lib/base_path.ts`. */
export const BASE_PATH_PLACEHOLDER = "/__inari_base_path__";

// Prerendered HTML carries the flight payload as consecutive
// `self.__next_f.push` calls split at arbitrary byte offsets, so a placeholder
// can straddle two of them. Dropping the boundary along with the placeholder
// merges the two calls, which is equivalent because the bootstrap concatenates
// their payloads. A future Next.js release that emits these script tags
// differently (a CSP nonce, say) would stop the boundary from matching, leaving
// a split placeholder in the prerendered pages.
const FLIGHT_CHUNK_BOUNDARY = '"])</script><script>self.__next_f.push([1,"';

/**
 * Canonicalizes an operator-supplied prefix into the form Next.js expects.
 *
 * Throws on values that would silently break every route.
 *
 * @param {string | undefined} raw
 * @returns {string} the prefix, or `""` when the app is served from the root
 */
export function normalizeBasePath(raw) {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  if (/[\s?#]/.test(trimmed)) {
    throw new Error(
      `BASE_PATH must not contain whitespace, "?" or "#": ${JSON.stringify(raw)}`,
    );
  }
  const rooted = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return rooted.replace(/\/+$/, "");
}

/**
 * Replaces the placeholder prefix throughout the build output, in place.
 *
 * Files are decoded as latin1 so every byte round-trips unchanged; the
 * placeholder is ASCII, so the search stays byte-exact even inside assets that
 * are not valid UTF-8. Files without the placeholder are never written.
 *
 * @param {object} options
 * @param {string} options.root directory holding the standalone build output
 * @param {readonly string[]} options.targets paths under `root` to rewrite,
 *   each a file or a directory tree; missing entries are skipped
 * @param {string} options.basePath replacement prefix, `""` to serve from root
 * @param {string} [options.placeholder]
 * @returns {Promise<number>} how many files were rewritten
 * @throws Error when the build output cannot be written, which means the image
 * needs a writable filesystem or a prefix baked at build time instead
 */
export async function applyBasePath({
  root,
  targets,
  basePath,
  placeholder = BASE_PATH_PLACEHOLDER,
}) {
  const pattern = splitTolerantPattern(placeholder);
  let rewritten = 0;
  for (const target of targets) {
    rewritten += await rewritePath(
      join(root, target),
      placeholder,
      pattern,
      basePath,
    );
  }
  return rewritten;
}

/** @param {string} value @returns {string} */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * Matches the placeholder whether or not a flight chunk boundary splits it.
 *
 * @param {string} placeholder
 * @returns {RegExp}
 */
function splitTolerantPattern(placeholder) {
  const boundary = `(?:${escapeRegExp(FLIGHT_CHUNK_BOUNDARY)})?`;
  return new RegExp([...placeholder].map(escapeRegExp).join(boundary), "g");
}

/**
 * @param {string} target
 * @param {string} placeholder
 * @param {RegExp} pattern
 * @param {string} basePath
 * @returns {Promise<number>}
 */
async function rewritePath(target, placeholder, pattern, basePath) {
  let entry;
  try {
    entry = await stat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  if (entry.isDirectory()) {
    const children = await readdir(target);
    let rewritten = 0;
    for (const child of children) {
      rewritten += await rewritePath(
        join(target, child),
        placeholder,
        pattern,
        basePath,
      );
    }
    return rewritten;
  }

  if (!entry.isFile()) {
    return 0;
  }

  const content = await readFile(target, "latin1");
  if (
    !content.includes(placeholder) &&
    !content.includes(FLIGHT_CHUNK_BOUNDARY)
  ) {
    return 0;
  }
  // A replacer function keeps `$` in the prefix from being read as a capture
  // group reference.
  const rewritten = content.replace(pattern, () => basePath);
  if (rewritten === content) {
    return 0;
  }
  await writeFile(target, rewritten, "latin1");
  return 1;
}
