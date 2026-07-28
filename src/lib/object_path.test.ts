import { describe, expect, it } from "vitest";
import { lastPathSegment } from "./object_path";

describe("lastPathSegment", () => {
  it("returns the key itself when it has no delimiter", () => {
    expect(lastPathSegment("report.pdf")).toBe("report.pdf");
  });

  it("returns the filename from a nested key", () => {
    expect(lastPathSegment("logs/2026/07/app.log")).toBe("app.log");
  });

  it("ignores a trailing delimiter", () => {
    expect(lastPathSegment("logs/2026/")).toBe("2026");
  });

  it("ignores repeated delimiters", () => {
    expect(lastPathSegment("logs//app.log")).toBe("app.log");
  });

  it("falls back to the key when no segment remains", () => {
    expect(lastPathSegment("")).toBe("");
    expect(lastPathSegment("/")).toBe("/");
  });
});
