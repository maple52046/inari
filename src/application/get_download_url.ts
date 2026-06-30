import type { ObjectStoragePort } from "@/domain/s3/ports";

/** Returns a short-lived presigned URL to download one object. */
export async function getDownloadUrl(
  storage: ObjectStoragePort,
  bucket: string,
  key: string,
): Promise<string> {
  return storage.getDownloadUrl(bucket, key);
}
