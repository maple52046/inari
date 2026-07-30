import { describe, expect, it, vi } from "vitest";
import { moveObjects } from "./move_objects";
import type { CopyObjectInput } from "@/domain/s3/ports";
import { StorageError } from "@/domain/s3/errors";
import { createFakeStorage } from "@/test/fakes";

/** Storage that records copies and reports every delete as successful. */
function createMovableStorage(overrides: {
  existing?: Set<string>;
  copyFails?: Set<string>;
  undeletable?: Set<string>;
}) {
  const copies: CopyObjectInput[] = [];
  const deleted: string[][] = [];
  const existing = new Set(overrides.existing ?? []);
  const storage = createFakeStorage({
    objectExists: async (_bucket, key) => existing.has(key),
    copyObject: async (input) => {
      if (overrides.copyFails?.has(input.sourceKey)) {
        throw new StorageError("access_denied");
      }
      copies.push(input);
      existing.add(input.destinationKey);
    },
    deleteObjects: async (_bucket, keys) => {
      deleted.push(keys);
      return {
        deleted: keys.filter((key) => !overrides.undeletable?.has(key)),
        failed: [],
      };
    },
  });
  return { storage, copies, deleted };
}

describe("moveObjects", () => {
  it("returns early without touching storage when no entries are given", async () => {
    const copySpy = vi.fn();
    const deleteSpy = vi.fn();
    const storage = createFakeStorage({
      copyObject: copySpy,
      deleteObjects: deleteSpy,
    });

    const result = await moveObjects(storage, {
      sourceBucket: "b",
      destinationBucket: "b",
      entries: [],
    });

    expect(result).toEqual({ moved: [], failed: [] });
    expect(copySpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("copies to the destination and then deletes the source", async () => {
    const { storage, copies, deleted } = createMovableStorage({});

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "dst",
      entries: [{ key: "a.txt", destinationKey: "archive/a.txt" }],
    });

    expect(copies).toEqual([
      {
        sourceBucket: "src",
        sourceKey: "a.txt",
        destinationBucket: "dst",
        destinationKey: "archive/a.txt",
      },
    ]);
    expect(deleted).toEqual([["a.txt"]]);
    expect(result.moved).toEqual([
      { key: "a.txt", destinationKey: "archive/a.txt" },
    ]);
    expect(result.failed).toEqual([]);
  });

  it("never deletes the source when the copy fails", async () => {
    const { storage, deleted } = createMovableStorage({
      copyFails: new Set(["a.txt"]),
    });

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [{ key: "a.txt", destinationKey: "archive/a.txt" }],
    });

    expect(deleted).toEqual([]);
    expect(result.moved).toEqual([]);
    expect(result.failed).toEqual([
      {
        key: "a.txt",
        message: "You do not have permission to access this bucket",
      },
    ]);
  });

  it("deletes only the sources whose own copy succeeded", async () => {
    const { storage, deleted } = createMovableStorage({
      copyFails: new Set(["b.txt"]),
    });

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [
        { key: "a.txt", destinationKey: "archive/a.txt" },
        { key: "b.txt", destinationKey: "archive/b.txt" },
        { key: "c.txt", destinationKey: "archive/c.txt" },
      ],
    });

    expect(deleted).toEqual([["a.txt", "c.txt"]]);
    expect(result.moved.map((entry) => entry.key)).toEqual(["a.txt", "c.txt"]);
    expect(result.failed.map((entry) => entry.key)).toEqual(["b.txt"]);
  });

  it("refuses to overwrite an object already at the destination", async () => {
    const { storage, copies, deleted } = createMovableStorage({
      existing: new Set(["archive/a.txt"]),
    });

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [{ key: "a.txt", destinationKey: "archive/a.txt" }],
    });

    expect(copies).toEqual([]);
    expect(deleted).toEqual([]);
    expect(result.failed).toEqual([
      { key: "a.txt", message: "An object already exists at the destination" },
    ]);
  });

  it("refuses a destination identical to the source, which would delete it", async () => {
    const { storage, copies, deleted } = createMovableStorage({});

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [{ key: "logs/a.txt", destinationKey: "logs/a.txt" }],
    });

    expect(copies).toEqual([]);
    expect(deleted).toEqual([]);
    expect(result.failed).toEqual([
      { key: "logs/a.txt", message: "Source and destination are the same" },
    ]);
  });

  it("allows the same key in a different bucket", async () => {
    const { storage, copies } = createMovableStorage({});

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "dst",
      entries: [{ key: "logs/a.txt", destinationKey: "logs/a.txt" }],
    });

    expect(copies).toHaveLength(1);
    expect(result.moved).toHaveLength(1);
  });

  it("stops a second entry aimed at the destination the first just took", async () => {
    const { storage, copies } = createMovableStorage({});

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [
        { key: "a.txt", destinationKey: "archive/merged.txt" },
        { key: "b.txt", destinationKey: "archive/merged.txt" },
      ],
    });

    expect(copies).toHaveLength(1);
    expect(result.moved.map((entry) => entry.key)).toEqual(["a.txt"]);
    expect(result.failed).toEqual([
      { key: "b.txt", message: "An object already exists at the destination" },
    ]);
  });

  it("reports a copied object whose source survived the delete", async () => {
    const { storage } = createMovableStorage({
      undeletable: new Set(["a.txt"]),
    });

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [{ key: "a.txt", destinationKey: "archive/a.txt" }],
    });

    expect(result.moved).toEqual([]);
    expect(result.failed).toEqual([
      {
        key: "a.txt",
        message:
          "Copied to the destination, but the original could not be removed",
      },
    ]);
  });

  it("rejects an empty or folder-shaped destination without calling storage", async () => {
    const { storage, copies } = createMovableStorage({});

    const result = await moveObjects(storage, {
      sourceBucket: "src",
      destinationBucket: "src",
      entries: [
        { key: "a.txt", destinationKey: "   " },
        { key: "b.txt", destinationKey: "archive/" },
      ],
    });

    expect(copies).toEqual([]);
    expect(result.failed).toEqual([
      { key: "a.txt", message: "Destination key is empty" },
      {
        key: "b.txt",
        message: "Destination must be an object key, not a folder",
      },
    ]);
  });
});
