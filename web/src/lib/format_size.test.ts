import { describe, expect, it } from "vitest";
import { formatSize } from "./format_size";

describe("formatSize", () => {
  it("renders zero and negatives as 0 B", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(-10)).toBe("0 B");
  });

  it("renders bytes without decimals", () => {
    expect(formatSize(512)).toBe("512 B");
  });

  it("steps through binary units", () => {
    expect(formatSize(1024)).toBe("1.00 KB");
    expect(formatSize(1024 ** 2)).toBe("1.00 MB");
    expect(formatSize(1.5 * 1024 ** 3)).toBe("1.50 GB");
  });

  it("uses one decimal for values >= 10", () => {
    expect(formatSize(20 * 1024 ** 2)).toBe("20.0 MB");
  });
});
