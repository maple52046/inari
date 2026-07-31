/**
 * Turns the API's RFC 3339 strings back into `Date` objects.
 *
 * Next.js used to revive dates automatically across the Server Component
 * boundary, so every component downstream expects real `Date` instances and
 * calls methods like `getTime()` on them. JSON has no date type, so without
 * this layer those calls would fail at runtime on a string — quietly, and only
 * on rows that happen to carry a timestamp.
 *
 * Revival happens here rather than in each caller so there is exactly one place
 * where the wire format stops and the domain shape begins.
 */

import type {
  BucketSummaryDto,
  CleanupCandidateDto,
  CommonPrefixDto,
  ObjectListPageDto,
  ObjectSummaryDto,
} from "./types";
import type {
  BucketSummary,
  CommonPrefix,
  ObjectListPage,
  ObjectSummary,
} from "@/domain/s3/models";
import type { CleanupCandidate } from "@/domain/s3/cleanup";

/**
 * Parses an RFC 3339 string, discarding one that is not a real instant.
 *
 * An unparseable value becomes `undefined` rather than an `Invalid Date`, which
 * would otherwise propagate into sorting and formatting as `NaN`.
 */
export function toDate(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Parses a timestamp that the domain requires to be present. */
export function toRequiredDate(value: string | undefined): Date {
  return toDate(value) ?? new Date(0);
}

export function reviveBucket(dto: BucketSummaryDto): BucketSummary {
  return { name: dto.name, createdAt: toDate(dto.createdAt) };
}

export function reviveObject(dto: ObjectSummaryDto): ObjectSummary {
  return {
    key: dto.key,
    name: dto.name,
    size: dto.size,
    lastModified: toDate(dto.lastModified),
    storageClass: dto.storageClass,
    etag: dto.etag,
  };
}

export function revivePrefix(dto: CommonPrefixDto): CommonPrefix {
  return { prefix: dto.prefix, name: dto.name };
}

export function reviveObjectListPage(dto: ObjectListPageDto): ObjectListPage {
  return {
    bucket: dto.bucket,
    prefix: dto.prefix,
    delimiter: dto.delimiter,
    prefixes: dto.prefixes.map(revivePrefix),
    objects: dto.objects.map(reviveObject),
    isTruncated: dto.isTruncated,
    continuationToken: dto.continuationToken,
    keyCount: dto.keyCount,
  };
}

export function reviveCleanupCandidate(
  dto: CleanupCandidateDto,
): CleanupCandidate {
  return {
    bucket: dto.bucket,
    key: dto.key,
    sizeBytes: dto.sizeBytes,
    // The server only ever emits candidates that carry a timestamp, because
    // ranking depends on one; the fallback exists to keep the type honest.
    lastModified: toRequiredDate(dto.lastModified),
    storageClass: dto.storageClass,
    reasons: dto.reasons,
  };
}
