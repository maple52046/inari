import type { ObjectStoragePort } from "@/domain/s3/ports";
import type {
  CleanupCandidate,
  CleanupPlan,
  CleanupScanOptions,
  CleanupScope,
  CleanupWarning,
} from "@/domain/s3/cleanup";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import { compareCandidates, deriveReasons } from "@/lib/cleanup_ranking";

/** Keys requested per page while walking a bucket recursively. */
const SCAN_PAGE_SIZE = 1000;

interface BucketScan {
  candidates: CleanupCandidate[];
  scannedObjects: number;
}

function matchesFilters(
  object: { size: number; lastModified?: Date },
  options: CleanupScanOptions,
): object is { size: number; lastModified: Date } {
  // A candidate must have a time, since cleanup ranks by lastModified.
  if (!object.lastModified) {
    return false;
  }
  if (
    options.minSizeBytes !== undefined &&
    object.size < options.minSizeBytes
  ) {
    return false;
  }
  if (options.olderThan && object.lastModified >= options.olderThan) {
    return false;
  }
  return true;
}

async function scanBucket(
  storage: ObjectStoragePort,
  bucket: string,
  prefix: string | undefined,
  options: CleanupScanOptions,
): Promise<BucketScan> {
  const candidates: CleanupCandidate[] = [];
  let scannedObjects = 0;
  let continuationToken: string | undefined;
  // Flat (delimiter-free) listing walks every object recursively.
  do {
    const page = await storage.listObjects({
      bucket,
      prefix,
      delimiter: "",
      continuationToken,
      maxKeys: SCAN_PAGE_SIZE,
    });
    for (const object of page.objects) {
      scannedObjects += 1;
      if (!matchesFilters(object, options)) {
        continue;
      }
      candidates.push({
        bucket,
        key: object.key,
        sizeBytes: object.size,
        lastModified: object.lastModified,
        storageClass: object.storageClass,
        reasons: deriveReasons(
          { sizeBytes: object.size, lastModified: object.lastModified },
          options,
        ),
      });
    }
    continuationToken = page.continuationToken;
  } while (continuationToken);
  return { candidates, scannedObjects };
}

/**
 * Builds a cleanup plan by scanning the scope, filtering, ranking, and limiting.
 *
 * Resilience: a per-bucket failure (e.g. access denied) becomes a warning and
 * the scan continues, so one inaccessible bucket never aborts an all-buckets
 * plan.
 *
 * Memory note: v1.1 collects all matching objects before sorting and slicing.
 * This is acceptable for typical buckets but can be heavy for very large ones;
 * v1.2 should switch to a streaming top-k selection.
 */
export async function scanCleanup(
  storage: ObjectStoragePort,
  scope: CleanupScope,
  options: CleanupScanOptions,
): Promise<CleanupPlan> {
  const buckets = scope.bucket
    ? [scope.bucket]
    : (await storage.listBuckets()).map((bucket) => bucket.name);

  const warnings: CleanupWarning[] = [];
  const collected: CleanupCandidate[] = [];
  let scannedObjects = 0;
  let scannedBuckets = 0;

  for (const bucket of buckets) {
    try {
      const result = await scanBucket(storage, bucket, scope.prefix, options);
      scannedBuckets += 1;
      scannedObjects += result.scannedObjects;
      collected.push(...result.candidates);
    } catch (error) {
      const message =
        error instanceof StorageError
          ? storageErrorMessage(error.kind)
          : "Failed to scan bucket";
      warnings.push({ bucket, message });
    }
  }

  collected.sort(compareCandidates);
  const candidates = collected.slice(0, options.maxResults);
  const candidateTotalSize = candidates.reduce(
    (sum, candidate) => sum + candidate.sizeBytes,
    0,
  );

  return {
    scope,
    options,
    candidates,
    summary: {
      scannedBuckets,
      scannedObjects,
      candidateCount: candidates.length,
      candidateTotalSize,
    },
    warnings,
    scannedAt: new Date(),
  };
}
