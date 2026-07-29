import { describe, expect, it } from "vitest";
import type { ListObjectsInput } from "@/domain/s3/ports";
import type { ObjectListPage, ObjectSummary } from "@/domain/s3/models";
import { scanPrefixUsage } from "./scan_prefix_usage";
import { createFakeStorage } from "@/test/fakes";

function object(key: string, size: number): ObjectSummary {
  return { key, name: key, size };
}

function page(objects: ObjectSummary[], continuationToken?: string) {
  return {
    bucket: "b",
    prefix: "",
    delimiter: "",
    prefixes: [],
    objects,
    isTruncated: continuationToken !== undefined,
    continuationToken,
    keyCount: objects.length,
  } satisfies ObjectListPage;
}

/** Storage returning a fixed set of keys in one page. */
function storageWith(
  objects: ObjectSummary[],
  onInput?: (i: ListObjectsInput) => void,
) {
  return createFakeStorage({
    listObjects: async (input: ListObjectsInput) => {
      onInput?.(input);
      return page(objects);
    },
  });
}

describe("scanPrefixUsage grouping", () => {
  it("groups deeper keys under their first sub-folder", async () => {
    const usage = await scanPrefixUsage(
      storageWith([
        object("logs/2026/a.log", 100),
        object("logs/2026/b.log", 200),
        object("logs/2025/c.log", 50),
      ]),
      { bucket: "b", prefix: "logs/" },
    );

    expect(usage.entries).toEqual([
      { name: "2026/", isPrefix: true, totalSize: 300, objectCount: 2 },
      { name: "2025/", isPrefix: true, totalSize: 50, objectCount: 1 },
    ]);
  });

  it("lists a key sitting directly in the location as an object", async () => {
    const usage = await scanPrefixUsage(
      storageWith([object("logs/readme.txt", 10)]),
      { bucket: "b", prefix: "logs/" },
    );

    expect(usage.entries).toEqual([
      { name: "readme.txt", isPrefix: false, totalSize: 10, objectCount: 1 },
    ]);
  });

  it("mixes folders and objects in one breakdown", async () => {
    const usage = await scanPrefixUsage(
      storageWith([
        object("logs/readme.txt", 10),
        object("logs/2026/a.log", 400),
      ]),
      { bucket: "b", prefix: "logs/" },
    );

    expect(usage.entries.map((entry) => [entry.name, entry.isPrefix])).toEqual([
      ["2026/", true],
      ["readme.txt", false],
    ]);
  });

  it("scans the bucket root when no prefix is given", async () => {
    const usage = await scanPrefixUsage(
      storageWith([object("top.txt", 5), object("dir/inner.txt", 15)]),
      { bucket: "b" },
    );

    expect(usage.scope).toBe("b");
    expect(usage.entries.map((entry) => entry.name)).toEqual([
      "dir/",
      "top.txt",
    ]);
  });
});

describe("scanPrefixUsage ordering and totals", () => {
  it("orders entries largest first", async () => {
    const usage = await scanPrefixUsage(
      storageWith([
        object("p/small/a", 1),
        object("p/big/a", 900),
        object("p/mid/a", 50),
      ]),
      { bucket: "b", prefix: "p/" },
    );

    expect(usage.entries.map((entry) => entry.name)).toEqual([
      "big/",
      "mid/",
      "small/",
    ]);
  });

  it("breaks ties on name so the order is stable", async () => {
    const usage = await scanPrefixUsage(
      storageWith([object("p/b/x", 10), object("p/a/x", 10)]),
      { bucket: "b", prefix: "p/" },
    );

    expect(usage.entries.map((entry) => entry.name)).toEqual(["a/", "b/"]);
  });

  it("totals every key, including one the breakdown cannot attribute", async () => {
    // The folder marker for the prefix itself belongs to no child.
    const usage = await scanPrefixUsage(
      storageWith([object("p/", 0), object("p/a/x", 40)]),
      { bucket: "b", prefix: "p/" },
    );

    expect(usage.entries).toHaveLength(1);
    expect(usage.objectCount).toBe(2);
    expect(usage.totalSize).toBe(40);
  });

  it("labels the scope with the bucket and prefix", async () => {
    const usage = await scanPrefixUsage(storageWith([object("p/a", 1)]), {
      bucket: "b",
      prefix: "p/",
    });
    expect(usage.scope).toBe("b/p/");
  });
});

describe("scanPrefixUsage listing", () => {
  it("asks for a flat listing restricted to the prefix", async () => {
    const seen: ListObjectsInput[] = [];
    await scanPrefixUsage(
      storageWith([object("p/a", 1)], (input) => seen.push(input)),
      { bucket: "b", prefix: "p/" },
    );

    expect(seen[0]?.prefix).toBe("p/");
    expect(seen[0]?.delimiter).toBe("");
  });

  it("omits the prefix entirely at the bucket root", async () => {
    const seen: ListObjectsInput[] = [];
    await scanPrefixUsage(
      storageWith([object("a", 1)], (input) => seen.push(input)),
      { bucket: "b" },
    );

    expect(seen[0]?.prefix).toBeUndefined();
  });

  it("follows continuation tokens to the end", async () => {
    const pages: ObjectListPage[] = [
      page([object("p/a/1", 10)], "next"),
      page([object("p/a/2", 20), object("p/b/1", 5)]),
    ];
    let call = 0;
    const storage = createFakeStorage({
      listObjects: async () => pages[call++]!,
    });

    const usage = await scanPrefixUsage(storage, {
      bucket: "b",
      prefix: "p/",
    });

    expect(call).toBe(2);
    expect(usage.objectCount).toBe(3);
    expect(usage.entries).toEqual([
      { name: "a/", isPrefix: true, totalSize: 30, objectCount: 2 },
      { name: "b/", isPrefix: true, totalSize: 5, objectCount: 1 },
    ]);
  });
});
