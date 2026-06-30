"use server";

import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { UsageScope } from "@/domain/s3/models";
import { scanUsage } from "@/application/scan_usage";
import { requireStorage } from "@/infrastructure/composition";

/** Result of scanning a single bucket's usage. */
export type ScanBucketResult =
  | { ok: true; scope: UsageScope }
  | { ok: false; bucket: string; message: string };

/**
 * Scans one bucket and returns its aggregated usage.
 *
 * Scanning bucket-by-bucket from the client lets the UI report incremental
 * progress without a streaming transport.
 */
export async function scanBucketAction(
  bucket: string,
): Promise<ScanBucketResult> {
  try {
    const storage = await requireStorage();
    const summary = await scanUsage(storage, { buckets: [bucket] });
    const scope = summary.scopes[0] ?? {
      scope: bucket,
      totalSize: 0,
      objectCount: 0,
    };
    return { ok: true, scope };
  } catch (error) {
    const message =
      error instanceof StorageError
        ? storageErrorMessage(error.kind)
        : "Failed to scan bucket";
    return { ok: false, bucket, message };
  }
}
