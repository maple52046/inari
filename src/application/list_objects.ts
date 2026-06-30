import type { ListObjectsInput, ObjectStoragePort } from "@/domain/s3/ports";
import type { ObjectListPage } from "@/domain/s3/models";

/** Default number of keys to request per object-listing page. */
export const DEFAULT_PAGE_SIZE = 200;

/** Lists one page of objects/prefixes for a bucket at a given prefix. */
export async function listObjects(
  storage: ObjectStoragePort,
  input: ListObjectsInput,
): Promise<ObjectListPage> {
  return storage.listObjects({
    maxKeys: DEFAULT_PAGE_SIZE,
    ...input,
  });
}
