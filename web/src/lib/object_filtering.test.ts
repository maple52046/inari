import { describe, expect, it } from "vitest";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import { filterObjects, filterPrefixes, sortObjects } from "./object_filtering";

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
    expect(filterObjects(sample, { keyContains: "BETA" })).toHaveLength(1);
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

describe("filterPrefixes", () => {
  const folders: CommonPrefix[] = [
    { prefix: "raw/2024/", name: "2024/" },
    { prefix: "raw/2025/", name: "2025/" },
    { prefix: "raw/thumbs/", name: "thumbs/" },
  ];

  it("keeps every folder while no filter is set", () => {
    expect(filterPrefixes(folders, {})).toHaveLength(3);
  });

  it("drops folders whose path does not match", () => {
    // A folder left in place while a filter is typed reads as a folder that
    // matched it, which is the impression this exists to prevent.
    const result = filterPrefixes(folders, { keyContains: "202" });
    expect(result.map((folder) => folder.name)).toEqual(["2024/", "2025/"]);
  });

  it("matches the whole path, as the object filter does", () => {
    expect(filterPrefixes(folders, { keyContains: "raw/" })).toHaveLength(3);
  });

  it("drops every folder while a size or date filter is set", () => {
    // Neither can be evaluated against a folder, so keeping one would claim it
    // satisfies a predicate nothing checked.
    expect(filterPrefixes(folders, { minSize: 1 })).toEqual([]);
    expect(filterPrefixes(folders, { maxSize: 1 })).toEqual([]);
    expect(filterPrefixes(folders, { before: new Date() })).toEqual([]);
    expect(filterPrefixes(folders, { after: new Date() })).toEqual([]);
  });

  it("does not mutate the input", () => {
    filterPrefixes(folders, { keyContains: "2024" });
    expect(folders).toHaveLength(3);
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
