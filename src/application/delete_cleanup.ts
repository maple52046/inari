import type { ObjectStoragePort } from "@/domain/s3/ports";
import type { DeleteFailure } from "@/domain/s3/models";

/** A single object to delete, identified by its bucket and key. */
export interface CleanupDeleteTarget {
  bucket: string;
  key: string;
}

/** Per-bucket outcome of a cleanup deletion. */
export interface CleanupBucketDeleteResult {
  bucket: string;
  deleted: string[];
  failed: DeleteFailure[];
}

function groupByBucket(
  targets: readonly CleanupDeleteTarget[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const target of targets) {
    const keys = groups.get(target.bucket);
    if (keys) {
      keys.push(target.key);
    } else {
      groups.set(target.bucket, [target.key]);
    }
  }
  return groups;
}

/**
 * Deletes cleanup candidates, grouping by bucket because `DeleteObjects` is
 * bucket-scoped. Returns one result per affected bucket so the UI can report
 * success and failure per bucket.
 */
export async function deleteCleanupCandidates(
  storage: ObjectStoragePort,
  targets: readonly CleanupDeleteTarget[],
): Promise<CleanupBucketDeleteResult[]> {
  const results: CleanupBucketDeleteResult[] = [];
  for (const [bucket, keys] of groupByBucket(targets)) {
    const result = await storage.deleteObjects(bucket, keys);
    results.push({ bucket, deleted: result.deleted, failed: result.failed });
  }
  return results;
}
