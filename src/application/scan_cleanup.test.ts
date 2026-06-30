import { describe, expect, it, vi } from "vitest";
import type { ListObjectsInput } from "@/domain/s3/ports";
import type { ObjectListPage, ObjectSummary } from "@/domain/s3/models";
import { StorageError } from "@/domain/s3/errors";
import { scanCleanup } from "./scan_cleanup";
import { createFakeStorage } from "@/test/fakes";

function obj(key: string, size: number, lastModified: Date): ObjectSummary {
  return { key, name: key, size, lastModified };
}

function page(objects: ObjectSummary[], bucket: string): ObjectListPage {
  return {
    bucket,
    prefix: "",
    delimiter: "",
    prefixes: [],
    objects,
    isTruncated: false,
    keyCount: objects.length,
  };
}

const old1 = new Date("2025-01-01");
const old2 = new Date("2025-06-01");
const recent = new Date("2026-06-01");

function twoBucketStorage() {
  return createFakeStorage({
    listBuckets: async () => [{ name: "alpha" }, { name: "beta" }],
    listObjects: async (input: ListObjectsInput) => {
      if (input.bucket === "alpha") {
        return page(
          [obj("a-old-small", 100, old1), obj("a-recent", 999, recent)],
          "alpha",
        );
      }
      return page([obj("b-old-large", 5000, old1)], "beta");
    },
  });
}

describe("scanCleanup", () => {
  it("scans all buckets and ranks oldest-first then largest-first", async () => {
    const plan = await scanCleanup(twoBucketStorage(), {}, { maxResults: 100 });
    // old1 entries first; within old1, larger (5000) before smaller (100).
    expect(plan.candidates.map((c) => c.key)).toEqual([
      "b-old-large",
      "a-old-small",
      "a-recent",
    ]);
    expect(plan.summary.scannedBuckets).toBe(2);
    expect(plan.summary.scannedObjects).toBe(3);
    expect(plan.summary.candidateCount).toBe(3);
    expect(plan.summary.candidateTotalSize).toBe(6099);
  });

  it("scans only the selected bucket and skips listBuckets", async () => {
    const listBuckets = vi.fn();
    const storage = createFakeStorage({
      listBuckets,
      listObjects: async () => page([obj("only", 1, old1)], "alpha"),
    });
    const plan = await scanCleanup(
      storage,
      { bucket: "alpha" },
      {
        maxResults: 100,
      },
    );
    expect(listBuckets).not.toHaveBeenCalled();
    expect(plan.candidates).toHaveLength(1);
  });

  it("applies min size and older-than filters with reasons", async () => {
    const plan = await scanCleanup(
      twoBucketStorage(),
      {},
      {
        maxResults: 100,
        minSizeBytes: 1000,
        olderThan: new Date("2026-01-01"),
      },
    );
    expect(plan.candidates.map((c) => c.key)).toEqual(["b-old-large"]);
    expect(plan.candidates[0]!.reasons).toEqual([
      "Older than selected date",
      "Larger than selected size",
    ]);
  });

  it("limits results to maxResults after global sort", async () => {
    const plan = await scanCleanup(twoBucketStorage(), {}, { maxResults: 1 });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]!.key).toBe("b-old-large");
  });

  it("records a warning and continues when a bucket fails", async () => {
    const storage = createFakeStorage({
      listBuckets: async () => [{ name: "alpha" }, { name: "denied" }],
      listObjects: async (input: ListObjectsInput) => {
        if (input.bucket === "denied") {
          throw new StorageError("access_denied");
        }
        return page([obj("ok", 1, old2)], "alpha");
      },
    });
    const plan = await scanCleanup(storage, {}, { maxResults: 100 });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.summary.scannedBuckets).toBe(1);
    expect(plan.warnings).toEqual([
      {
        bucket: "denied",
        message: "You do not have permission to access this bucket",
      },
    ]);
  });
});
