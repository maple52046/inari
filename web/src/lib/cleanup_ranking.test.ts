import { describe, expect, it } from "vitest";
import type { CleanupCandidate } from "@/domain/s3/cleanup";
import { compareCandidates, deriveReasons } from "./cleanup_ranking";

function candidate(
  overrides: Partial<CleanupCandidate> & {
    lastModified: Date;
    sizeBytes: number;
  },
): CleanupCandidate {
  return {
    bucket: "b",
    key: "k",
    storageClass: undefined,
    reasons: [],
    ...overrides,
  };
}

describe("compareCandidates", () => {
  it("orders older objects first", () => {
    const older = candidate({
      lastModified: new Date("2026-01-01"),
      sizeBytes: 1,
    });
    const newer = candidate({
      lastModified: new Date("2026-06-01"),
      sizeBytes: 1,
    });
    expect(compareCandidates(older, newer)).toBeLessThan(0);
  });

  it("orders larger objects first within the same time", () => {
    const time = new Date("2026-01-01");
    const small = candidate({ lastModified: time, sizeBytes: 100 });
    const large = candidate({ lastModified: time, sizeBytes: 999 });
    expect(compareCandidates(large, small)).toBeLessThan(0);
  });

  it("breaks ties by bucket then key", () => {
    const time = new Date("2026-01-01");
    const base = { lastModified: time, sizeBytes: 5 };
    expect(
      compareCandidates(
        candidate({ ...base, bucket: "a", key: "z" }),
        candidate({ ...base, bucket: "b", key: "a" }),
      ),
    ).toBeLessThan(0);
    expect(
      compareCandidates(
        candidate({ ...base, bucket: "a", key: "a" }),
        candidate({ ...base, bucket: "a", key: "b" }),
      ),
    ).toBeLessThan(0);
  });

  it("produces a stable full ordering when sorted", () => {
    const time = new Date("2026-01-01");
    const list = [
      candidate({ lastModified: new Date("2026-03-01"), sizeBytes: 10 }),
      candidate({ lastModified: time, sizeBytes: 10, key: "b" }),
      candidate({ lastModified: time, sizeBytes: 20, key: "a" }),
    ];
    const sorted = [...list].sort(compareCandidates);
    expect(sorted.map((c) => c.key)).toEqual(["a", "b", "k"]);
  });
});

describe("deriveReasons", () => {
  it("flags old and large independently and together", () => {
    const object = {
      sizeBytes: 1000,
      lastModified: new Date("2025-01-01"),
    };
    expect(
      deriveReasons(object, {
        maxResults: 10,
        olderThan: new Date("2026-01-01"),
        minSizeBytes: 500,
      }),
    ).toEqual(["Older than selected date", "Larger than selected size"]);
  });

  it("falls back to ranking when no filter matched", () => {
    const object = { sizeBytes: 10, lastModified: new Date("2026-06-01") };
    expect(deriveReasons(object, { maxResults: 10 })).toEqual([
      "Ranked by cleanup order",
    ]);
  });
});
