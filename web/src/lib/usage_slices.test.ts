import { describe, expect, it } from "vitest";
import {
  formatShare,
  OTHER_SLICE_NAME,
  toUsageByBucket,
  toUsageSlices,
} from "./usage_slices";

const scope = (name: string, totalSize: number) => ({
  scope: name,
  totalSize,
  objectCount: 1,
});

describe("toUsageSlices ordering", () => {
  it("ranks buckets largest first regardless of scan order", () => {
    const slices = toUsageSlices([
      scope("alpha", 100),
      scope("beta", 900),
      scope("gamma", 500),
    ]);
    expect(slices.map((slice) => slice.name)).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("computes each share against the scanned total", () => {
    const slices = toUsageSlices([scope("a", 750), scope("b", 250)]);
    expect(slices[0]?.share).toBeCloseTo(0.75);
    expect(slices[1]?.share).toBeCloseTo(0.25);
  });
});

describe("toUsageSlices empty input", () => {
  it("returns nothing for no scopes", () => {
    expect(toUsageSlices([])).toEqual([]);
  });

  it("returns nothing when every bucket is empty", () => {
    expect(toUsageSlices([scope("a", 0), scope("b", 0)])).toEqual([]);
  });

  it("drops empty buckets but keeps the rest", () => {
    const slices = toUsageSlices([scope("empty", 0), scope("full", 10)]);
    expect(slices.map((slice) => slice.name)).toEqual(["full"]);
  });
});

describe("toUsageSlices merging", () => {
  it("merges buckets below the threshold into one trailing slice", () => {
    const slices = toUsageSlices([
      scope("big", 970),
      scope("tiny1", 10),
      scope("tiny2", 10),
      scope("tiny3", 10),
    ]);
    expect(slices.map((slice) => slice.name)).toEqual([
      "big",
      OTHER_SLICE_NAME,
    ]);
    const other = slices[1];
    expect(other?.bytes).toBe(30);
    expect(other?.isAggregate).toBe(true);
    expect(other?.share).toBeCloseTo(0.03);
  });

  it("keeps a lone small bucket named rather than merging it", () => {
    const slices = toUsageSlices([scope("big", 990), scope("tiny", 10)]);
    expect(slices.map((slice) => slice.name)).toEqual(["big", "tiny"]);
    expect(slices.every((slice) => !slice.isAggregate)).toBe(true);
  });

  it("merges nothing when every bucket is above the threshold", () => {
    const slices = toUsageSlices([
      scope("a", 400),
      scope("b", 350),
      scope("c", 250),
    ]);
    expect(slices).toHaveLength(3);
    expect(slices.every((slice) => !slice.isAggregate)).toBe(true);
  });

  it("preserves the total across a merge", () => {
    const scopes = [
      scope("big", 800),
      scope("mid", 150),
      scope("t1", 5),
      scope("t2", 5),
      scope("t3", 40),
    ];
    const slices = toUsageSlices(scopes);
    const charted = slices.reduce((sum, slice) => sum + slice.bytes, 0);
    expect(charted).toBe(1000);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1);
  });

  it("does not mutate the caller's array", () => {
    const scopes = [scope("a", 1), scope("b", 999)];
    toUsageSlices(scopes);
    expect(scopes.map((entry) => entry.scope)).toEqual(["a", "b"]);
  });
});

describe("toUsageByBucket", () => {
  it("indexes each bucket with its share of the total", () => {
    const byBucket = toUsageByBucket([scope("a", 750), scope("b", 250)]);
    expect(byBucket.get("a")?.share).toBeCloseTo(0.75);
    expect(byBucket.get("b")?.bytes).toBe(250);
    expect(byBucket.get("b")?.objectCount).toBe(1);
  });

  it("keeps empty buckets, which have no slice but do have a card", () => {
    const byBucket = toUsageByBucket([scope("full", 10), scope("empty", 0)]);
    expect(byBucket.has("empty")).toBe(true);
    expect(byBucket.get("empty")?.share).toBe(0);
  });

  it("reports a zero share rather than dividing by zero", () => {
    const byBucket = toUsageByBucket([scope("a", 0), scope("b", 0)]);
    expect(byBucket.get("a")?.share).toBe(0);
    expect(byBucket.get("b")?.share).toBe(0);
  });

  it("is empty for no scopes", () => {
    expect(toUsageByBucket([]).size).toBe(0);
  });
});

describe("formatShare", () => {
  it("rounds to whole percents above one percent", () => {
    expect(formatShare(0.7549)).toBe("75%");
    expect(formatShare(0.02)).toBe("2%");
  });

  it("keeps a decimal below one percent so it never reads as zero", () => {
    expect(formatShare(0.004)).toBe("0.4%");
  });
});
