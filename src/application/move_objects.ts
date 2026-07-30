import type { ObjectStoragePort } from "@/domain/s3/ports";
import type { MoveFailure, MoveResult, MovedObject } from "@/domain/s3/models";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";

/** One object to relocate, with the key it should end up under. */
export interface MoveEntry {
  key: string;
  destinationKey: string;
}

/** Identifies the objects to move and where they are going. */
export interface MoveObjectsInput {
  sourceBucket: string;
  destinationBucket: string;
  entries: MoveEntry[];
}

const SAME_LOCATION = "Source and destination are the same";
const EMPTY_DESTINATION = "Destination key is empty";
const FOLDER_DESTINATION = "Destination must be an object key, not a folder";
const DESTINATION_TAKEN = "An object already exists at the destination";
const SOURCE_REMAINS =
  "Copied to the destination, but the original could not be removed";

function messageFor(error: unknown): string {
  return error instanceof StorageError
    ? storageErrorMessage(error.kind)
    : "The object could not be copied";
}

/**
 * Moves objects by copying each one and then deleting the sources that landed.
 *
 * Object storage has no move operation, so this composes one. The invariant that
 * makes it safe: **a source is deleted only after its own copy is known to have
 * succeeded**, so a failed copy can never destroy the only remaining version.
 *
 * Nothing is overwritten. A destination that already holds an object is reported
 * as a failure instead, which also rules out the case where the destination
 * resolves to the source itself and the delete would erase it outright.
 *
 * The operation is not atomic: callers must handle a result where only some
 * entries moved, including entries whose copy landed but whose source survived.
 */
export async function moveObjects(
  storage: ObjectStoragePort,
  input: MoveObjectsInput,
): Promise<MoveResult> {
  const failed: MoveFailure[] = [];
  const copied: MoveEntry[] = [];

  // Sequential rather than concurrent: each entry probes the destination before
  // writing it, and only that ordering lets an earlier copy be seen by a later
  // probe, so two entries aimed at one destination cannot both proceed.
  for (const entry of input.entries) {
    const destinationKey = entry.destinationKey.trim();
    if (destinationKey.length === 0) {
      failed.push({ key: entry.key, message: EMPTY_DESTINATION });
      continue;
    }
    if (destinationKey.endsWith("/")) {
      failed.push({ key: entry.key, message: FOLDER_DESTINATION });
      continue;
    }
    if (
      input.sourceBucket === input.destinationBucket &&
      destinationKey === entry.key
    ) {
      failed.push({ key: entry.key, message: SAME_LOCATION });
      continue;
    }
    try {
      if (await storage.objectExists(input.destinationBucket, destinationKey)) {
        failed.push({ key: entry.key, message: DESTINATION_TAKEN });
        continue;
      }
      await storage.copyObject({
        sourceBucket: input.sourceBucket,
        sourceKey: entry.key,
        destinationBucket: input.destinationBucket,
        destinationKey,
      });
      copied.push({ key: entry.key, destinationKey });
    } catch (error) {
      failed.push({ key: entry.key, message: messageFor(error) });
    }
  }

  if (copied.length === 0) {
    return { moved: [], failed };
  }

  const deletion = await storage.deleteObjects(
    input.sourceBucket,
    copied.map((entry) => entry.key),
  );
  const removed = new Set(deletion.deleted);
  const moved: MovedObject[] = [];
  for (const entry of copied) {
    if (removed.has(entry.key)) {
      moved.push(entry);
    } else {
      // The object now exists in both places. That has to be reported, because
      // it is the one outcome the user has to clean up by hand.
      failed.push({ key: entry.key, message: SOURCE_REMAINS });
    }
  }
  return { moved, failed };
}
