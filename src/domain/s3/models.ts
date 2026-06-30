/**
 * Domain models for S3-compatible object storage.
 *
 * These are plain, framework-free structures owned by the domain layer. Data
 * crossing the boundary from the AWS SDK adapter or to the UI is expressed only
 * in terms of these types, never SDK-shaped values.
 */

/** Connection credentials and endpoint configuration for an S3 target. */
export interface S3Connection {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Path-style addressing; required by most self-hosted S3 backends. */
  forcePathStyle: boolean;
  /**
   * Disables TLS certificate verification for the connection.
   *
   * Insecure: only for self-hosted backends with self-signed or internal-CA
   * certificates. Defaults to false (verification enabled).
   */
  skipTlsVerification: boolean;
}

/** A bucket as listed by the storage backend. */
export interface BucketSummary {
  name: string;
  createdAt?: Date;
}

/** A single stored object within a bucket/prefix. */
export interface ObjectSummary {
  /** Full object key. */
  key: string;
  /** Basename of the key relative to the current prefix. */
  name: string;
  /** Object size in bytes. */
  size: number;
  lastModified?: Date;
  storageClass?: string;
  etag?: string;
}

/** A folder-like grouping produced by the delimiter (S3 common prefix). */
export interface CommonPrefix {
  /** Full prefix, including the trailing delimiter. */
  prefix: string;
  /** Basename of the prefix relative to the current prefix. */
  name: string;
}

/** One page of a delimited object listing. */
export interface ObjectListPage {
  bucket: string;
  prefix: string;
  delimiter: string;
  prefixes: CommonPrefix[];
  objects: ObjectSummary[];
  isTruncated: boolean;
  /** Token to fetch the next page; absent when the listing is exhausted. */
  continuationToken?: string;
  keyCount: number;
}

/** Aggregated usage for a single scope (all buckets, one bucket, a prefix). */
export interface UsageScope {
  scope: string;
  totalSize: number;
  objectCount: number;
}

/**
 * Result of a scan-based usage estimate.
 *
 * Values reflect only objects visible through the S3-compatible list API and
 * exclude provider overhead, incomplete multipart uploads, versions, and delete
 * markers.
 */
export interface UsageSummary {
  scopes: UsageScope[];
  totalSize: number;
  objectCount: number;
  scannedAt: Date;
}

/** Outcome of a batch delete request. */
export interface DeleteResult {
  deleted: string[];
  failed: DeleteFailure[];
}

/** A single key that could not be deleted, with a normalized reason. */
export interface DeleteFailure {
  key: string;
  message: string;
}
