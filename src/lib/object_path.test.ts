import { describe, expect, it } from "vitest";
import {
  childOfPrefix,
  joinObjectPath,
  lastPathSegment,
  parentPrefix,
} from "./object_path";

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

describe("parentPrefix", () => {
  it("returns an empty prefix for a key at the root", () => {
    expect(parentPrefix("report.pdf")).toBe("");
  });

  it("keeps the trailing delimiter so it matches a listing prefix", () => {
    expect(parentPrefix("logs/2026/app.log")).toBe("logs/2026/");
  });

  it("treats a folder marker as living in its parent", () => {
    expect(parentPrefix("logs/2026/")).toBe("logs/2026/");
  });
});

describe("joinObjectPath", () => {
  it("joins a folder and a name", () => {
    expect(joinObjectPath("logs/2026/", "app.log")).toBe("logs/2026/app.log");
  });

  it("accepts a folder without its trailing delimiter", () => {
    expect(joinObjectPath("logs/2026", "app.log")).toBe("logs/2026/app.log");
  });

  it("returns a bare name at the bucket root", () => {
    expect(joinObjectPath("", "app.log")).toBe("app.log");
    expect(joinObjectPath("/", "app.log")).toBe("app.log");
  });

  it("does not leave a leading separator from a typed path", () => {
    expect(joinObjectPath("/logs/", "app.log")).toBe("logs/app.log");
  });

  it("keeps nested names intact", () => {
    expect(joinObjectPath("archive", "2026/app.log")).toBe(
      "archive/2026/app.log",
    );
  });
});

describe("childOfPrefix", () => {
  it("reports a key directly under the prefix as an object", () => {
    expect(childOfPrefix("logs/app.log", "logs/")).toEqual({
      name: "app.log",
      isPrefix: false,
    });
  });

  it("folds a deeper key into its first sub-prefix", () => {
    expect(childOfPrefix("logs/2026/07/app.log", "logs/")).toEqual({
      name: "2026/",
      isPrefix: true,
    });
  });

  it("keeps the delimiter so a sub-prefix reads as a folder", () => {
    expect(childOfPrefix("logs/2026/", "logs/")?.name).toBe("2026/");
  });

  it("treats an empty prefix as the bucket root", () => {
    expect(childOfPrefix("report.pdf", "")).toEqual({
      name: "report.pdf",
      isPrefix: false,
    });
    expect(childOfPrefix("logs/app.log", "")).toEqual({
      name: "logs/",
      isPrefix: true,
    });
  });

  it("ignores the prefix's own folder marker", () => {
    expect(childOfPrefix("logs/", "logs/")).toBeUndefined();
  });

  it("ignores a key outside the prefix", () => {
    expect(childOfPrefix("other/app.log", "logs/")).toBeUndefined();
  });

  it("does not mistake a sibling sharing the prefix's leading text", () => {
    // "logs-archive/" starts with "logs" but is not inside "logs/".
    expect(childOfPrefix("logs-archive/a.log", "logs/")).toBeUndefined();
  });
});
