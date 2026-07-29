import type { ObjectStoragePort } from "@/domain/s3/ports";
import { usageScopeLabel } from "@/domain/s3/models";
import { childOfPrefix } from "@/lib/object_path";

/** Usage of one immediate child of a scanned location. */
export interface PrefixUsageEntry {
  /** Name relative to the scanned prefix; folders keep their trailing delimiter. */
  name: string;
  /** Whether this aggregates a sub-tree rather than describing a single object. */
  isPrefix: boolean;
  totalSize: number;
  objectCount: number;
}

/** What a prefix scan covered. */
export interface ScanPrefixUsageInput {
  bucket: string;
  /** Omitted or empty means the bucket root. */
  prefix?: string;
}

/** Breakdown of a single location by what it directly contains. */
export interface PrefixUsage {
  /** Human label for the location, e.g. `bucket/logs/`. */
  scope: string;
  /** Direct children, largest first. */
  entries: PrefixUsageEntry[];
  totalSize: number;
  objectCount: number;
}

/** Number of keys requested per page during a recursive scan. */
const SCAN_PAGE_SIZE = 1000;

/**
 * Measures what a location contains, one entry per immediate child.
 *
 * Uses a single flat (delimiter-free) listing and attributes each key to its
 * top-level child, so the whole breakdown costs exactly one walk of the sub-tree.
 * Listing each child separately would read the same objects again per level.
 *
 * A folder marker (an object whose key is the prefix itself) belongs to no child
 * and is skipped, though its bytes still count towards the total.
 *
 * This is a best-effort estimate on the same terms as a bucket scan: it sees only
 * what the list API returns, excluding provider overhead, incomplete multipart
 * uploads, versions, and delete markers.
 */
export async function scanPrefixUsage(
  storage: ObjectStoragePort,
  input: ScanPrefixUsageInput,
): Promise<PrefixUsage> {
  const prefix = input.prefix ?? "";
  const byName = new Map<string, PrefixUsageEntry>();
  let continuationToken: string | undefined;
  let totalSize = 0;
  let objectCount = 0;

  do {
    const page = await storage.listObjects({
      bucket: input.bucket,
      prefix: prefix || undefined,
      delimiter: "",
      continuationToken,
      maxKeys: SCAN_PAGE_SIZE,
    });
    for (const object of page.objects) {
      totalSize += object.size;
      objectCount += 1;
      const child = childOfPrefix(object.key, prefix);
      if (!child) {
        continue;
      }
      const existing = byName.get(child.name);
      if (existing) {
        existing.totalSize += object.size;
        existing.objectCount += 1;
      } else {
        byName.set(child.name, {
          name: child.name,
          isPrefix: child.isPrefix,
          totalSize: object.size,
          objectCount: 1,
        });
      }
    }
    continuationToken = page.continuationToken;
  } while (continuationToken);

  const entries = [...byName.values()].sort(
    (a, b) => b.totalSize - a.totalSize || a.name.localeCompare(b.name),
  );

  return {
    scope: usageScopeLabel(input.bucket, prefix || undefined),
    entries,
    totalSize,
    objectCount,
  };
}
