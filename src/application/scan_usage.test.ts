import { describe, expect, it } from "vitest";
import type { ListObjectsInput } from "@/domain/s3/ports";
import type { ObjectListPage, ObjectSummary } from "@/domain/s3/models";
import { scanUsage } from "./scan_usage";
import { createFakeStorage } from "@/test/fakes";

function object(key: string, size: number): ObjectSummary {
  return { key, name: key, size };
}

/** Fake that returns two pages then exhausts via continuation token. */
function paginatedStorage() {
  const pages: Record<string, ObjectListPage> = {
    first: {
      bucket: "b",
      prefix: "",
      delimiter: "",
      prefixes: [],
      objects: [object("a", 100), object("b", 200)],
      isTruncated: true,
      continuationToken: "next",
      keyCount: 2,
    },
    next: {
      bucket: "b",
      prefix: "",
      delimiter: "",
      prefixes: [],
      objects: [object("c", 300)],
      isTruncated: false,
      keyCount: 1,
    },
  };
  return createFakeStorage({
    listObjects: async (input: ListObjectsInput) =>
      pages[input.continuationToken ?? "first"]!,
  });
}

describe("scanUsage", () => {
  it("sums sizes and counts across pages", async () => {
    const summary = await scanUsage(paginatedStorage(), { buckets: ["b"] });
    expect(summary.totalSize).toBe(600);
    expect(summary.objectCount).toBe(3);
    expect(summary.scopes).toEqual([
      { scope: "b", totalSize: 600, objectCount: 3 },
    ]);
  });

  it("aggregates multiple buckets and reports progress", async () => {
    const progress: number[] = [];
    const summary = await scanUsage(
      paginatedStorage(),
      { buckets: ["b", "b2"] },
      (update) => progress.push(update.objectCount),
    );
    expect(summary.scopes).toHaveLength(2);
    expect(summary.totalSize).toBe(1200);
    expect(progress.length).toBeGreaterThan(0);
  });
});
