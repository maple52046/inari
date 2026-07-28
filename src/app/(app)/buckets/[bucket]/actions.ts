"use server";

import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { DeleteResult, ObjectListPage } from "@/domain/s3/models";
import { listObjects } from "@/application/list_objects";
import { deleteObjects } from "@/application/delete_objects";
import { getDownloadUrl } from "@/application/get_download_url";
import { requireStorage } from "@/infrastructure/composition";

/** Discriminated result returned to client components from list loading. */
export type LoadObjectsResult =
  { ok: true; page: ObjectListPage } | { ok: false; message: string };

/** Discriminated result returned from a batch delete. */
export type DeleteObjectsActionResult =
  { ok: true; result: DeleteResult } | { ok: false; message: string };

/** Discriminated result returned when requesting a download URL. */
export type DownloadUrlResult =
  { ok: true; url: string; expiresAt: number } | { ok: false; message: string };

function messageFor(error: unknown, fallback: string): string {
  return error instanceof StorageError
    ? storageErrorMessage(error.kind)
    : fallback;
}

/** Default presigned lifetime in seconds, mirroring the adapter default. */
const DEFAULT_EXPIRES_IN = 3600;

/** Computes the absolute expiry (epoch ms) for a presigned URL. */
function expiresAtFrom(expiresIn: number | undefined): number {
  return Date.now() + (expiresIn ?? DEFAULT_EXPIRES_IN) * 1000;
}

/** Loads one page of objects/prefixes for client-driven pagination. */
export async function loadObjectsAction(input: {
  bucket: string;
  prefix: string;
  continuationToken?: string;
}): Promise<LoadObjectsResult> {
  try {
    const storage = await requireStorage();
    const page = await listObjects(storage, {
      bucket: input.bucket,
      prefix: input.prefix,
      continuationToken: input.continuationToken,
    });
    return { ok: true, page };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to load next page"),
    };
  }
}

/** Deletes the selected keys and reports per-key outcome. */
export async function deleteObjectsAction(input: {
  bucket: string;
  keys: string[];
}): Promise<DeleteObjectsActionResult> {
  try {
    const storage = await requireStorage();
    const result = await deleteObjects(storage, {
      bucket: input.bucket,
      keys: input.keys,
    });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Some objects could not be deleted"),
    };
  }
}

/** Returns a presigned URL the browser can use to download an object. */
export async function downloadUrlAction(input: {
  bucket: string;
  key: string;
  expiresIn?: number;
}): Promise<DownloadUrlResult> {
  try {
    const storage = await requireStorage();
    const url = await getDownloadUrl(
      storage,
      input.bucket,
      input.key,
      input.expiresIn,
    );
    return { ok: true, url, expiresAt: expiresAtFrom(input.expiresIn) };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to prepare download"),
    };
  }
}
