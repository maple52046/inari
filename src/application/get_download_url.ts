import type { ObjectStoragePort } from "@/domain/s3/ports";

/**
 * Returns a presigned URL to download one object.
 *
 * @param expiresIn - URL lifetime in seconds; omit for the adapter default.
 */
export async function getDownloadUrl(
  storage: ObjectStoragePort,
  bucket: string,
  key: string,
  expiresIn?: number,
): Promise<string> {
  return storage.getDownloadUrl(bucket, key, expiresIn);
}
