/**
 * Domain models for the Cleanup Planner.
 *
 * Cleanup works across buckets, so unlike {@link ObjectSummary} every candidate
 * carries its owning bucket. Time is always `lastModified` because standard S3
 * listings expose no universal creation time.
 */

/**
 * Selection of what to scan.
 *
 * `prefix` is reserved for a future version; the use case honours it when set,
 * but the v1.1 UI keeps the field disabled.
 */
export interface CleanupScope {
  /** Omitted means "all accessible buckets". */
  bucket?: string;
  /** Reserved: restrict to a key prefix within the bucket. */
  prefix?: string;
}

/** Filters and limits applied while building a cleanup plan. */
export interface CleanupScanOptions {
  minSizeBytes?: number;
  /** Keep objects last modified strictly before this instant. */
  olderThan?: Date;
  /** Hard cap on the number of returned candidates. */
  maxResults: number;
}

/** A single object proposed for cleanup. */
export interface CleanupCandidate {
  bucket: string;
  key: string;
  sizeBytes: number;
  lastModified: Date;
  storageClass?: string;
  /** Human-readable reasons this object was ranked as a candidate. */
  reasons: string[];
}

/** A bucket that could not be scanned; surfaced without aborting the scan. */
export interface CleanupWarning {
  bucket: string;
  message: string;
}

/** Aggregate counts for a completed scan. */
export interface CleanupPlanSummary {
  scannedBuckets: number;
  scannedObjects: number;
  candidateCount: number;
  candidateTotalSize: number;
}

/** Result of a cleanup scan: ranked candidates plus context and warnings. */
export interface CleanupPlan {
  scope: CleanupScope;
  options: CleanupScanOptions;
  candidates: CleanupCandidate[];
  summary: CleanupPlanSummary;
  warnings: CleanupWarning[];
  scannedAt: Date;
}
