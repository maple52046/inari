import type { ObjectStoragePort } from "@/domain/s3/ports";
import type { BucketSummary } from "@/domain/s3/models";

/** Lists all buckets visible to the connected credentials. */
export async function listBuckets(
  storage: ObjectStoragePort,
): Promise<BucketSummary[]> {
  return storage.listBuckets();
}
