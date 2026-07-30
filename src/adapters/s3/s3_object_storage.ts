import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import type { CompletedPart } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CopyObjectInput,
  ObjectStoragePort,
  ListObjectsInput,
} from "@/domain/s3/ports";
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
/** Default lifetime of presigned download URLs, in seconds (one hour). */
const DOWNLOAD_URL_TTL = 3600;

/** Largest source S3 accepts for a single-request copy; above this, multipart. */
const SINGLE_COPY_LIMIT = 5 * 1024 ** 3;
/** Range size per `UploadPartCopy`; also above the 5MB floor S3 sets for parts. */
const COPY_PART_SIZE = 256 * 1024 ** 2;
/** Parts allowed in one multipart upload, which caps the usable part size. */
const MAX_COPY_PARTS = 10_000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Builds the `x-amz-copy-source` value identifying a copy's source object.
 *
 * S3 requires this value URL-encoded and the SDK does not encode it, so a key
 * holding a space or any non-ASCII character is rejected with
 * `SignatureDoesNotMatch` unless it is escaped here. Separators are left literal
 * and only the segments escaped, matching the `bucket/key` form S3 documents.
 */
function copySourceOf(bucket: string, key: string): string {
  const escapedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${encodeURIComponent(bucket)}/${escapedKey}`;
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

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return true;
    } catch (error) {
      const normalized = toStorageError(error);
      if (normalized.kind === "not_found") {
        return false;
      }
      throw normalized;
    }
  }

  async copyObject(input: CopyObjectInput): Promise<void> {
    // The source is inspected first because the copy strategy depends on its
    // size, and because a multipart copy has to restate metadata the
    // single-request copy would have carried over on its own.
    const source = await this.headObject(input.sourceBucket, input.sourceKey);
    const size = source.ContentLength ?? 0;
    if (size > SINGLE_COPY_LIMIT) {
      await this.multipartCopy(
        input,
        size,
        source.ContentType,
        source.Metadata,
      );
      return;
    }
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: input.destinationBucket,
          Key: input.destinationKey,
          CopySource: copySourceOf(input.sourceBucket, input.sourceKey),
        }),
      );
    } catch (error) {
      throw toStorageError(error, "copy_failed");
    }
  }

  private async headObject(
    bucket: string,
    key: string,
  ): Promise<{
    ContentLength?: number;
    ContentType?: string;
    Metadata?: Record<string, string>;
  }> {
    try {
      return await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      throw toStorageError(error, "copy_failed");
    }
  }

  /**
   * Copies a source above {@link SINGLE_COPY_LIMIT} as a series of byte ranges.
   *
   * Side effect: on any failure the started upload is aborted, because an
   * incomplete multipart upload is invisible to listings yet keeps accruing
   * storage cost until a lifecycle rule reclaims it.
   */
  private async multipartCopy(
    input: CopyObjectInput,
    size: number,
    contentType: string | undefined,
    metadata: Record<string, string> | undefined,
  ): Promise<void> {
    // Raised above the preferred size only when the object is large enough that
    // fixed-size parts would exceed the per-upload part limit.
    const partSize = Math.max(COPY_PART_SIZE, Math.ceil(size / MAX_COPY_PARTS));
    const copySource = copySourceOf(input.sourceBucket, input.sourceKey);
    let uploadId: string | undefined;
    try {
      const created = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: input.destinationBucket,
          Key: input.destinationKey,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      uploadId = created.UploadId;
      if (!uploadId) {
        throw new StorageError("copy_failed");
      }
      const parts: CompletedPart[] = [];
      for (let start = 0; start < size; start += partSize) {
        const end = Math.min(start + partSize, size) - 1;
        const partNumber = parts.length + 1;
        const part = await this.client.send(
          new UploadPartCopyCommand({
            Bucket: input.destinationBucket,
            Key: input.destinationKey,
            UploadId: uploadId,
            PartNumber: partNumber,
            CopySource: copySource,
            CopySourceRange: `bytes=${start}-${end}`,
          }),
        );
        parts.push({ ETag: part.CopyPartResult?.ETag, PartNumber: partNumber });
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.destinationBucket,
          Key: input.destinationKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (error) {
      if (uploadId) {
        await this.abortUpload(
          input.destinationBucket,
          input.destinationKey,
          uploadId,
        );
      }
      throw toStorageError(error, "copy_failed");
    }
  }

  /**
   * Abandons a failed multipart upload, best effort.
   *
   * The caller must see the failure that caused the abort, so a failing abort is
   * swallowed rather than replacing it; the leftover upload is then only
   * reclaimable by a bucket lifecycle rule.
   */
  private async abortUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch {
      // Documented above: masking the original copy failure would be worse than
      // leaving the incomplete upload behind.
    }
  }

  async getDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = DOWNLOAD_URL_TTL,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn },
      );
    } catch (error) {
      throw toStorageError(error);
    }
  }
}
