import type { Bucket, CommonPrefix, _Object } from "@aws-sdk/client-s3";
import type {
  BucketSummary,
  CommonPrefix as DomainPrefix,
  ObjectSummary,
} from "@/domain/s3/models";

/** Returns the basename of a key/prefix relative to the current prefix. */
function basename(key: string, prefix: string, delimiter: string): string {
  const withoutPrefix = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const trimmed = withoutPrefix.endsWith(delimiter)
    ? withoutPrefix.slice(0, -delimiter.length)
    : withoutPrefix;
  return trimmed.length > 0 ? trimmed : key;
}

export function mapBucket(bucket: Bucket): BucketSummary {
  return {
    name: bucket.Name ?? "",
    createdAt: bucket.CreationDate ?? undefined,
  };
}

export function mapObject(
  object: _Object,
  prefix: string,
  delimiter: string,
): ObjectSummary {
  const key = object.Key ?? "";
  return {
    key,
    name: basename(key, prefix, delimiter),
    size: object.Size ?? 0,
    lastModified: object.LastModified ?? undefined,
    storageClass: object.StorageClass ?? undefined,
    etag: object.ETag ?? undefined,
  };
}

export function mapPrefix(
  commonPrefix: CommonPrefix,
  prefix: string,
  delimiter: string,
): DomainPrefix {
  const value = commonPrefix.Prefix ?? "";
  return {
    prefix: value,
    name: basename(value, prefix, delimiter),
  };
}
