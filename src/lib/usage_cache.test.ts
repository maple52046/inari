import { describe, expect, it } from "vitest";
import {
  parseUsageCache,
  serializeUsageCache,
  type UsageCacheStamp,
} from "./usage_cache";

const STAMP: UsageCacheStamp = {
  endpoint: "https://s3.example.com",
  sessionCreatedAt: "2026-07-29T00:00:00.000Z",
};

const USAGE = {
  scopes: [
    { scope: "backups", totalSize: 2048, objectCount: 12 },
    { scope: "logs", totalSize: 0, objectCount: 0 },
  ],
  scannedAt: new Date("2026-07-29T06:30:00.000Z"),
};

describe("usage cache round trip", () => {
  it("recovers the scopes and the scan time", () => {
    const parsed = parseUsageCache(serializeUsageCache(STAMP, USAGE), STAMP);
    expect(parsed?.scopes).toEqual(USAGE.scopes);
    expect(parsed?.scannedAt.toISOString()).toBe(USAGE.scannedAt.toISOString());
  });

  it("returns a Date, not the stored string", () => {
    const parsed = parseUsageCache(serializeUsageCache(STAMP, USAGE), STAMP);
    expect(parsed?.scannedAt).toBeInstanceOf(Date);
  });
});

describe("usage cache stamp", () => {
  it("rejects a scan taken against another endpoint", () => {
    const raw = serializeUsageCache(STAMP, USAGE);
    const parsed = parseUsageCache(raw, {
      ...STAMP,
      endpoint: "https://other.example.com",
    });
    expect(parsed).toBeUndefined();
  });

  it("rejects a scan from an earlier session on the same endpoint", () => {
    const raw = serializeUsageCache(STAMP, USAGE);
    const parsed = parseUsageCache(raw, {
      ...STAMP,
      sessionCreatedAt: "2026-07-29T10:00:00.000Z",
    });
    expect(parsed).toBeUndefined();
  });
});

describe("usage cache rejects unusable input", () => {
  it("treats absent values as no cache", () => {
    expect(parseUsageCache(null, STAMP)).toBeUndefined();
    expect(parseUsageCache(undefined, STAMP)).toBeUndefined();
    expect(parseUsageCache("", STAMP)).toBeUndefined();
  });

  it("does not throw on malformed JSON", () => {
    expect(parseUsageCache("{not json", STAMP)).toBeUndefined();
    expect(parseUsageCache("[]", STAMP)).toBeUndefined();
    expect(parseUsageCache("null", STAMP)).toBeUndefined();
  });

  it("rejects a payload whose scopes are the wrong shape", () => {
    const raw = JSON.stringify({
      ...STAMP,
      scannedAt: USAGE.scannedAt.toISOString(),
      scopes: [{ scope: "backups", totalSize: "2048", objectCount: 12 }],
    });
    expect(parseUsageCache(raw, STAMP)).toBeUndefined();
  });

  it("rejects a payload with no scopes array", () => {
    const raw = JSON.stringify({
      ...STAMP,
      scannedAt: USAGE.scannedAt.toISOString(),
    });
    expect(parseUsageCache(raw, STAMP)).toBeUndefined();
  });

  it("rejects an unparseable scan time", () => {
    const raw = JSON.stringify({
      ...STAMP,
      scannedAt: "not a date",
      scopes: USAGE.scopes,
    });
    expect(parseUsageCache(raw, STAMP)).toBeUndefined();
  });
});
