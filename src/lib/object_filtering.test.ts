import { describe, expect, it } from "vitest";
import type { ObjectSummary } from "@/domain/s3/models";
import { filterObjects, sortObjects } from "./object_filtering";

function obj(key: string, size: number, lastModified?: Date): ObjectSummary {
  return { key, name: key, size, lastModified };
}

const sample: ObjectSummary[] = [
  obj("alpha.txt", 100, new Date("2026-01-01")),
  obj("beta.log", 5000, new Date("2026-06-01")),
  obj("gamma.bin", 250, new Date("2026-03-15")),
];

describe("filterObjects", () => {
  it("matches by case-insensitive substring of the key", () => {
    expect(filterObjects(sample, { search: "BETA" })).toHaveLength(1);
  });

  it("filters by min and max size inclusively", () => {
    const result = filterObjects(sample, { minSize: 100, maxSize: 250 });
    expect(result.map((o) => o.key)).toEqual(["alpha.txt", "gamma.bin"]);
  });

  it("filters by modified-before and modified-after", () => {
    const before = filterObjects(sample, { before: new Date("2026-02-01") });
    expect(before.map((o) => o.key)).toEqual(["alpha.txt"]);

    const after = filterObjects(sample, { after: new Date("2026-04-01") });
    expect(after.map((o) => o.key)).toEqual(["beta.log"]);
  });

  it("excludes objects without a date when a date filter is set", () => {
    const undated = [obj("no-date", 1)];
    expect(filterObjects(undated, { after: new Date("2020-01-01") })).toEqual(
      [],
    );
  });
});

describe("sortObjects", () => {
  it("sorts by size ascending and descending without mutating input", () => {
    const asc = sortObjects(sample, { key: "size", direction: "asc" });
    expect(asc.map((o) => o.size)).toEqual([100, 250, 5000]);
    const desc = sortObjects(sample, { key: "size", direction: "desc" });
    expect(desc.map((o) => o.size)).toEqual([5000, 250, 100]);
    expect(sample[0]!.key).toBe("alpha.txt");
  });

  it("sorts by last modified", () => {
    const asc = sortObjects(sample, {
      key: "lastModified",
      direction: "asc",
    });
    expect(asc.map((o) => o.key)).toEqual([
      "alpha.txt",
      "gamma.bin",
      "beta.log",
    ]);
  });
});
