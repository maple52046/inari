import type { CleanupCandidate, CleanupScanOptions } from "@/domain/s3/cleanup";

/**
 * Compares two candidates by cleanup priority.
 *
 * Order: lastModified ascending (oldest first), then size descending (largest
 * first), then bucket and key ascending as deterministic tie-breakers so equal
 * time/size never produce unstable ordering.
 */
export function compareCandidates(
  a: CleanupCandidate,
  b: CleanupCandidate,
): number {
  const byTime = a.lastModified.getTime() - b.lastModified.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  const bySize = b.sizeBytes - a.sizeBytes;
  if (bySize !== 0) {
    return bySize;
  }
  const byBucket = a.bucket.localeCompare(b.bucket);
  if (byBucket !== 0) {
    return byBucket;
  }
  return a.key.localeCompare(b.key);
}

/**
 * Derives the reasons an object qualifies as a cleanup candidate.
 *
 * When no size/date filter is active, the object is included purely by cleanup
 * ranking, which is reported explicitly so the UI never shows an empty reason.
 */
export function deriveReasons(
  object: { sizeBytes: number; lastModified: Date },
  options: CleanupScanOptions,
): string[] {
  const reasons: string[] = [];
  if (options.olderThan && object.lastModified < options.olderThan) {
    reasons.push("Older than selected date");
  }
  if (
    options.minSizeBytes !== undefined &&
    object.sizeBytes >= options.minSizeBytes
  ) {
    reasons.push("Larger than selected size");
  }
  if (reasons.length === 0) {
    reasons.push("Ranked by cleanup order");
  }
  return reasons;
}
