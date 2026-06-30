import type { ListObjectsInput, ObjectStoragePort } from "@/domain/s3/ports";
import type {
  BucketSummary,
  DeleteResult,
  ObjectListPage,
} from "@/domain/s3/models";
import type {
  ConnectionSession,
  ConnectionSessionPort,
} from "@/domain/session/ports";
import type { S3Connection } from "@/domain/s3/models";

/** Builds an in-memory storage port with overridable behaviour for tests. */
export function createFakeStorage(
  overrides: Partial<ObjectStoragePort> = {},
): ObjectStoragePort {
  const base: ObjectStoragePort = {
    testConnection: async () => undefined,
    listBuckets: async (): Promise<BucketSummary[]> => [],
    isBucketAccessible: async (): Promise<boolean> => true,
    listObjects: async (input: ListObjectsInput): Promise<ObjectListPage> => ({
      bucket: input.bucket,
      prefix: input.prefix ?? "",
      delimiter: input.delimiter ?? "/",
      prefixes: [],
      objects: [],
      isTruncated: false,
      keyCount: 0,
    }),
    deleteObjects: async (): Promise<DeleteResult> => ({
      deleted: [],
      failed: [],
    }),
    getDownloadUrl: async (): Promise<string> => "https://example/download",
  };
  return { ...base, ...overrides };
}

/** In-memory session store recording the last saved connection. */
export class FakeSessionStore implements ConnectionSessionPort {
  saved: S3Connection | undefined;
  cleared = false;

  async getConnection(): Promise<S3Connection | undefined> {
    return this.saved;
  }

  async getSession(): Promise<ConnectionSession | undefined> {
    if (!this.saved) {
      return undefined;
    }
    const now = new Date();
    return { connection: this.saved, createdAt: now, lastUsedAt: now };
  }

  async save(connection: S3Connection): Promise<void> {
    this.saved = connection;
  }

  async clear(): Promise<void> {
    this.saved = undefined;
    this.cleared = true;
  }
}

/** A valid sample connection for tests. */
export const sampleConnection: S3Connection = {
  endpoint: "https://s3.example.com",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secret",
  region: "us-east-1",
  forcePathStyle: true,
  skipTlsVerification: false,
};
