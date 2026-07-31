import { describe, expect, it } from "vitest";
import {
  reviveBucket,
  reviveCleanupCandidate,
  reviveObject,
  reviveObjectListPage,
  toDate,
} from "./revive";

describe("date revival", () => {
  it("turns an RFC 3339 string into a Date", () => {
    const parsed = toDate("2026-07-31T06:13:56.237Z");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe("2026-07-31T06:13:56.237Z");
  });

  it("leaves an absent timestamp absent", () => {
    expect(toDate(undefined)).toBeUndefined();
  });

  it("discards a value that is not a real instant", () => {
    // An Invalid Date would survive every truthiness check and only surface as
    // NaN once something sorted or formatted it.
    expect(toDate("last tuesday")).toBeUndefined();
  });
});

describe("object revival", () => {
  it("gives lastModified a Date the components can call getTime on", () => {
    const object = reviveObject({
      key: "a.jpg",
      name: "a.jpg",
      size: 10,
      lastModified: "2026-01-02T03:04:05Z",
    });

    expect(object.lastModified).toBeInstanceOf(Date);
    expect(object.lastModified?.getTime()).toBe(
      Date.parse("2026-01-02T03:04:05Z"),
    );
  });

  it("keeps an object without a timestamp usable", () => {
    const object = reviveObject({ key: "a.jpg", name: "a.jpg", size: 10 });
    expect(object.lastModified).toBeUndefined();
  });

  it("revives every row of a page", () => {
    const page = reviveObjectListPage({
      bucket: "photos",
      prefix: "",
      delimiter: "/",
      prefixes: [{ prefix: "2024/", name: "2024" }],
      objects: [
        { key: "a.jpg", name: "a.jpg", size: 1, lastModified: "2026-01-01T00:00:00Z" },
        { key: "b.jpg", name: "b.jpg", size: 2 },
      ],
      isTruncated: false,
      keyCount: 2,
    });

    expect(page.objects[0]?.lastModified).toBeInstanceOf(Date);
    expect(page.objects[1]?.lastModified).toBeUndefined();
    expect(page.prefixes[0]?.name).toBe("2024");
  });
});

describe("bucket revival", () => {
  it("revives the creation date", () => {
    const bucket = reviveBucket({
      name: "photos",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(bucket.createdAt).toBeInstanceOf(Date);
  });
});

describe("cleanup candidate revival", () => {
  it("always yields a Date, since ranking depends on one", () => {
    const candidate = reviveCleanupCandidate({
      bucket: "photos",
      key: "old.txt",
      sizeBytes: 100,
      lastModified: "2020-01-01T00:00:00Z",
      reasons: ["Older than selected date"],
    });

    expect(candidate.lastModified).toBeInstanceOf(Date);
    expect(candidate.lastModified.getFullYear()).toBe(2020);
  });
});
