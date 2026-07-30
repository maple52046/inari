import type {
  BucketSummary,
  DeleteResult,
  ObjectListPage,
  S3Connection,
} from "./models";

/** Source and destination of a single server-side object copy. */
export interface CopyObjectInput {
  sourceBucket: string;
  sourceKey: string;
  destinationBucket: string;
  destinationKey: string;
}

/** Parameters for a single delimited object-listing request. */
export interface ListObjectsInput {
  bucket: string;
  prefix?: string;
  /** Delimiter used to group keys into folder-like prefixes. */
  delimiter?: string;
  /** Opaque token from a previous page; omit for the first page. */
  continuationToken?: string;
  maxKeys?: number;
}

/**
 * Port for standard, vendor-neutral S3-compatible operations.
 *
 * Implementations live in the adapter layer and must throw
 * {@link StorageError} for all failures. Provider-specific behaviour belongs in
 * a {@link ProviderPlugin}, not here.
 */
export interface ObjectStoragePort {
  /** Verifies that the connection can reach the backend and authenticate. */
  testConnection(): Promise<void>;
  listBuckets(): Promise<BucketSummary[]>;
  /** Returns whether the bucket exists and is accessible to the caller. */
  isBucketAccessible(bucket: string): Promise<boolean>;
  listObjects(input: ListObjectsInput): Promise<ObjectListPage>;
  /** Deletes the given keys, chunking internally to respect API limits. */
  deleteObjects(bucket: string, keys: string[]): Promise<DeleteResult>;
  /**
   * Reports whether an object exists at exactly this key.
   *
   * A listing cannot answer this: it drops the key equal to the requested
   * prefix, which is the very row an existence probe asks about.
   */
  objectExists(bucket: string, key: string): Promise<boolean>;
  /**
   * Copies one object server-side, across buckets when asked.
   *
   * Implementations must handle sources beyond the backend's single-request copy
   * limit, so a caller can copy any object it is able to list. Overwrites the
   * destination if one exists; callers that must not clobber check first.
   */
  copyObject(input: CopyObjectInput): Promise<void>;
  /**
   * Returns a presigned URL to download a single object.
   *
   * @param expiresIn - URL lifetime in seconds; defaults to one hour.
   */
  getDownloadUrl(
    bucket: string,
    key: string,
    expiresIn?: number,
  ): Promise<string>;
}

/**
 * Builds a storage port for a candidate connection.
 *
 * Defined inward so use cases can validate/connect without naming the concrete
 * AWS adapter; the composition root supplies the implementation.
 */
export type ObjectStorageFactory = (
  connection: S3Connection,
) => ObjectStoragePort;

/**
 * Extension seam for provider-specific capabilities (e.g. MinIO admin).
 *
 * The core never depends on a concrete plugin; the composition root decides
 * whether one is wired. When absent, all standard features still work.
 */
export interface ProviderPlugin {
  readonly id: string;
  readonly label: string;
  /** Whether the plugin has the configuration it needs to operate. */
  isConfigured(): boolean;
}
