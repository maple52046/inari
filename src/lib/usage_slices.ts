import type { UsageScope } from "@/domain/s3/models";

/** A pie slice derived from scanned usage. */
export interface UsageSlice {
  name: string;
  bytes: number;
  /** Share of the scanned total, from 0 to 1. */
  share: number;
  /** Set when the slice stands in for several buckets too small to draw. */
  isAggregate: boolean;
}

/** Name given to the merged tail. */
export const OTHER_SLICE_NAME = "Other";

/**
 * Buckets below this share are merged.
 *
 * Usage is typically dominated by one or two buckets, which leaves the rest as
 * slivers that cannot be seen or labelled. Merging them keeps the chart readable
 * and still accounts for their bytes.
 */
const MERGE_BELOW_SHARE = 0.02;

/**
 * Ranks scanned buckets into pie slices, largest first.
 *
 * Ordering is by size rather than scan order so a slice's colour reflects its
 * rank. Empty buckets are dropped: they have no area to draw.
 */
export function toUsageSlices(scopes: UsageScope[]): UsageSlice[] {
  const sized = scopes.filter((scope) => scope.totalSize > 0);
  const total = sized.reduce((sum, scope) => sum + scope.totalSize, 0);
  if (total === 0) {
    return [];
  }

  const ranked: UsageSlice[] = [...sized]
    .sort((a, b) => b.totalSize - a.totalSize)
    .map((scope) => ({
      name: scope.scope,
      bytes: scope.totalSize,
      share: scope.totalSize / total,
      isAggregate: false,
    }));

  const small = ranked.filter((slice) => slice.share < MERGE_BELOW_SHARE);
  // Merging a lone small bucket would cost it its name and gain nothing.
  if (small.length < 2) {
    return ranked;
  }

  const kept = ranked.filter((slice) => slice.share >= MERGE_BELOW_SHARE);
  const bytes = small.reduce((sum, slice) => sum + slice.bytes, 0);
  return [
    ...kept,
    {
      name: OTHER_SLICE_NAME,
      bytes,
      share: bytes / total,
      isAggregate: true,
    },
  ];
}

/** Per-bucket usage prepared for display beside a bucket. */
export interface BucketUsage {
  bytes: number;
  objectCount: number;
  /** Share of the scanned total, from 0 to 1. */
  share: number;
}

/**
 * Indexes scanned usage by bucket name.
 *
 * Empty buckets are kept, unlike in {@link toUsageSlices}: a card showing
 * "0 B, 0 objects" is informative even though a zero-area slice is not.
 */
export function toUsageByBucket(
  scopes: UsageScope[],
): Map<string, BucketUsage> {
  const total = scopes.reduce((sum, scope) => sum + scope.totalSize, 0);
  return new Map(
    scopes.map((scope) => [
      scope.scope,
      {
        bytes: scope.totalSize,
        objectCount: scope.objectCount,
        share: total > 0 ? scope.totalSize / total : 0,
      },
    ]),
  );
}

/** Formats a share for display, keeping sub-percent values from reading as 0%. */
export function formatShare(share: number): string {
  const percent = share * 100;
  return `${percent < 1 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}
