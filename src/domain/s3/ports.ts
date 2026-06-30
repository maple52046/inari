import type {
  BucketSummary,
  DeleteResult,
  ObjectListPage,
  S3Connection,
} from "./models";

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
  /** Returns a short-lived presigned URL to download a single object. */
  getDownloadUrl(bucket: string, key: string): Promise<string>;
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
