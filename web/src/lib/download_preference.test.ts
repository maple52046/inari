import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOWNLOAD_PREFERENCE,
  parseDownloadPreference,
  serializeDownloadPreference,
} from "./download_preference";

describe("parseDownloadPreference", () => {
  it("returns defaults for an empty value", () => {
    expect(parseDownloadPreference(undefined)).toEqual(
      DEFAULT_DOWNLOAD_PREFERENCE,
    );
  });

  it("parses mode and expiry", () => {
    expect(parseDownloadPreference("presigned:21600")).toEqual({
      mode: "presigned",
      expiry: 21600,
    });
  });

  it("falls back to direct for an unknown mode", () => {
    expect(parseDownloadPreference("bogus:3600").mode).toBe("direct");
  });

  it("falls back to default expiry for an invalid expiry", () => {
    expect(parseDownloadPreference("presigned:5").expiry).toBe(3600);
  });
});

describe("serializeDownloadPreference", () => {
  it("round-trips through parse", () => {
    const pref = { mode: "presigned", expiry: 86400 } as const;
    expect(parseDownloadPreference(serializeDownloadPreference(pref))).toEqual(
      pref,
    );
  });
});
