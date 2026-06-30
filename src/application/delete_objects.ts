import type { ObjectStoragePort } from "@/domain/s3/ports";
import type { DeleteResult } from "@/domain/s3/models";

/** Identifies the objects to delete from a single bucket. */
export interface DeleteObjectsInput {
  bucket: string;
  keys: string[];
}

/** Deletes the selected keys, returning per-key success/failure. */
export async function deleteObjects(
  storage: ObjectStoragePort,
  input: DeleteObjectsInput,
): Promise<DeleteResult> {
  if (input.keys.length === 0) {
    return { deleted: [], failed: [] };
  }
  return storage.deleteObjects(input.bucket, input.keys);
}
