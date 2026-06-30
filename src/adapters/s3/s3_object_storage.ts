import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStoragePort, ListObjectsInput } from "@/domain/s3/ports";
import type {
  BucketSummary,
  DeleteResult,
  ObjectListPage,
} from "@/domain/s3/models";
import { StorageError } from "@/domain/s3/errors";
import { createS3Client } from "./s3_client_factory";
import { toStorageError } from "./s3_error_mapper";
import { mapBucket, mapObject, mapPrefix } from "./s3_mappers";
import type { S3Connection } from "@/domain/s3/models";

/** Maximum keys per S3 `DeleteObjects` request. */
const DELETE_BATCH_LIMIT = 1000;
const DEFAULT_DELIMITER = "/";
/** Lifetime of presigned download URLs, in seconds. */
const DOWNLOAD_URL_TTL = 300;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** AWS SDK v3 implementation of {@link ObjectStoragePort}. */
export class S3ObjectStorage implements ObjectStoragePort {
  private readonly client: S3Client;

  constructor(connection: S3Connection) {
    this.client = createS3Client(connection);
  }

  async testConnection(): Promise<void> {
    try {
      await this.client.send(new ListBucketsCommand({}));
    } catch (error) {
      throw toStorageError(error, "invalid_credential");
    }
  }

  async listBuckets(): Promise<BucketSummary[]> {
    try {
      const response = await this.client.send(new ListBucketsCommand({}));
      return (response.Buckets ?? []).map(mapBucket);
    } catch (error) {
      throw toStorageError(error, "invalid_credential");
    }
  }

  async isBucketAccessible(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      const normalized = toStorageError(error);
      if (
        normalized.kind === "not_found" ||
        normalized.kind === "access_denied"
      ) {
        return false;
      }
      throw normalized;
    }
  }

  async listObjects(input: ListObjectsInput): Promise<ObjectListPage> {
    const prefix = input.prefix ?? "";
    // An empty delimiter means a flat, recursive listing (used by usage scans);
    // omit it entirely rather than sending an invalid empty value.
    const delimiter = input.delimiter ?? DEFAULT_DELIMITER;
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: input.bucket,
          Prefix: prefix.length > 0 ? prefix : undefined,
          Delimiter: delimiter.length > 0 ? delimiter : undefined,
          ContinuationToken: input.continuationToken,
          MaxKeys: input.maxKeys,
        }),
      );
      const objects = (response.Contents ?? [])
        .map((object) => mapObject(object, prefix, delimiter))
        // The prefix placeholder object (the "folder" key itself) is noise.
        .filter((object) => object.key !== prefix);
      return {
        bucket: input.bucket,
        prefix,
        delimiter,
        prefixes: (response.CommonPrefixes ?? []).map((commonPrefix) =>
          mapPrefix(commonPrefix, prefix, delimiter),
        ),
        objects,
        isTruncated: response.IsTruncated ?? false,
        continuationToken: response.NextContinuationToken ?? undefined,
        keyCount: response.KeyCount ?? objects.length,
      };
    } catch (error) {
      throw toStorageError(error, "pagination_failed");
    }
  }

  async deleteObjects(bucket: string, keys: string[]): Promise<DeleteResult> {
    const result: DeleteResult = { deleted: [], failed: [] };
    for (const batch of chunk(keys, DELETE_BATCH_LIMIT)) {
      try {
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: batch.map((key) => ({ Key: key })),
              Quiet: false,
            },
          }),
        );
        for (const deleted of response.Deleted ?? []) {
          if (deleted.Key) {
            result.deleted.push(deleted.Key);
          }
        }
        for (const failure of response.Errors ?? []) {
          result.failed.push({
            key: failure.Key ?? "",
            message: failure.Code ?? "Delete failed",
          });
        }
      } catch (error) {
        const normalized =
          error instanceof StorageError
            ? error
            : toStorageError(error, "delete_failed");
        for (const key of batch) {
          result.failed.push({ key, message: normalized.kind });
        }
      }
    }
    return result;
  }

  async getDownloadUrl(bucket: string, key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: DOWNLOAD_URL_TTL },
      );
    } catch (error) {
      throw toStorageError(error);
    }
  }
}
