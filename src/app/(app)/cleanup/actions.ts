"use server";

import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { CleanupPlan } from "@/domain/s3/cleanup";
import { scanCleanup } from "@/application/scan_cleanup";
import {
  deleteCleanupCandidates,
  type CleanupBucketDeleteResult,
  type CleanupDeleteTarget,
} from "@/application/delete_cleanup";
import { requireStorage } from "@/infrastructure/composition";

/** Serializable input for a cleanup scan request. */
export interface ScanCleanupInput {
  bucket?: string;
  minSizeBytes?: number;
  /** ISO date string; objects modified before this are kept. */
  olderThanIso?: string;
  maxResults: number;
}

/** Discriminated result of a cleanup scan. */
export type ScanCleanupResult =
  { ok: true; plan: CleanupPlan } | { ok: false; message: string };

/** Discriminated result of a cleanup deletion. */
export type DeleteCleanupResult =
  | { ok: true; results: CleanupBucketDeleteResult[] }
  | { ok: false; message: string };

function messageFor(error: unknown, fallback: string): string {
  return error instanceof StorageError
    ? storageErrorMessage(error.kind)
    : fallback;
}

/** Scans the requested scope and returns a ranked cleanup plan. */
export async function scanCleanupAction(
  input: ScanCleanupInput,
): Promise<ScanCleanupResult> {
  try {
    const storage = await requireStorage();
    const plan = await scanCleanup(
      storage,
      { bucket: input.bucket },
      {
        minSizeBytes: input.minSizeBytes,
        olderThan: input.olderThanIso
          ? new Date(input.olderThanIso)
          : undefined,
        maxResults: input.maxResults,
      },
    );
    return { ok: true, plan };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to scan for cleanup"),
    };
  }
}

/** Deletes the selected candidates, grouped per bucket. */
export async function deleteCleanupAction(
  targets: CleanupDeleteTarget[],
): Promise<DeleteCleanupResult> {
  try {
    const storage = await requireStorage();
    const results = await deleteCleanupCandidates(storage, targets);
    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Some objects could not be deleted"),
    };
  }
}
