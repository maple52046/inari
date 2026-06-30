import type { ObjectStoragePort } from "@/domain/s3/ports";
import type { UsageScope, UsageSummary } from "@/domain/s3/models";

/** Per-bucket progress emitted during a scan. */
export interface ScanProgress {
  bucket: string;
  objectCount: number;
  totalSize: number;
}

/** Identifies which buckets a usage scan should cover. */
export interface ScanUsageInput {
  buckets: string[];
}

/** Number of keys requested per page during a recursive scan. */
const SCAN_PAGE_SIZE = 1000;

async function scanBucket(
  storage: ObjectStoragePort,
  bucket: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<UsageScope> {
  let continuationToken: string | undefined;
  let totalSize = 0;
  let objectCount = 0;
  // A flat (delimiter-free) listing walks every object recursively.
  do {
    const page = await storage.listObjects({
      bucket,
      delimiter: "",
      continuationToken,
      maxKeys: SCAN_PAGE_SIZE,
    });
    for (const object of page.objects) {
      totalSize += object.size;
      objectCount += 1;
    }
    continuationToken = page.continuationToken;
    onProgress?.({ bucket, objectCount, totalSize });
  } while (continuationToken);
  return { scope: bucket, totalSize, objectCount };
}

/**
 * Estimates usage by scanning visible objects through the standard list API.
 *
 * This is a best-effort estimate: it excludes provider overhead, incomplete
 * multipart uploads, object versions, and delete markers. Callers must present
 * the result as scan-based, not authoritative.
 */
export async function scanUsage(
  storage: ObjectStoragePort,
  input: ScanUsageInput,
  onProgress?: (progress: ScanProgress) => void,
): Promise<UsageSummary> {
  const scopes: UsageScope[] = [];
  let totalSize = 0;
  let objectCount = 0;
  for (const bucket of input.buckets) {
    const scope = await scanBucket(storage, bucket, onProgress);
    scopes.push(scope);
    totalSize += scope.totalSize;
    objectCount += scope.objectCount;
  }
  return { scopes, totalSize, objectCount, scannedAt: new Date() };
}
