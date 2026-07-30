import { describe, expect, it } from "vitest";
import { BASE_PATH_PLACEHOLDER, normalizeBasePath } from "./base_path";

describe("normalizeBasePath", () => {
  it("treats unset, empty and root values as no prefix", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("  ")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("keeps an already canonical prefix", () => {
    expect(normalizeBasePath("/dashboard")).toBe("/dashboard");
    expect(normalizeBasePath("/tools/inari")).toBe("/tools/inari");
  });

  it("adds the leading slash and drops trailing ones", () => {
    expect(normalizeBasePath("dashboard")).toBe("/dashboard");
    expect(normalizeBasePath("/dashboard/")).toBe("/dashboard");
    expect(normalizeBasePath(" dashboard// ")).toBe("/dashboard");
  });

  it("rejects values that would break routing", () => {
    expect(() => normalizeBasePath("/dash board")).toThrow();
    expect(() => normalizeBasePath("/dashboard?a=1")).toThrow();
    expect(() => normalizeBasePath("/dashboard#top")).toThrow();
  });

  it("leaves the placeholder canonical so it can be baked as a basePath", () => {
    expect(normalizeBasePath(BASE_PATH_PLACEHOLDER)).toBe(
      BASE_PATH_PLACEHOLDER,
    );
  });
});
