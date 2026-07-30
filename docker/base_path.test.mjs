import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BASE_PATH_PLACEHOLDER as TS_PLACEHOLDER,
  normalizeBasePath as tsNormalizeBasePath,
} from "../src/lib/base_path.ts";
import {
  BASE_PATH_PLACEHOLDER,
  applyBasePath,
  normalizeBasePath,
} from "./base_path.mjs";

const CASES = [
  undefined,
  "",
  "  ",
  "/",
  "/dashboard",
  "dashboard",
  "/dashboard/",
  " dashboard// ",
  "/tools/inari",
];

describe("normalizeBasePath", () => {
  it("agrees with the TypeScript implementation it duplicates", () => {
    expect(BASE_PATH_PLACEHOLDER).toBe(TS_PLACEHOLDER);
    for (const value of CASES) {
      expect(normalizeBasePath(value)).toBe(tsNormalizeBasePath(value));
    }
  });

  it("rejects values that would break routing", () => {
    expect(() => normalizeBasePath("/dashboard?a=1")).toThrow();
  });
});

describe("applyBasePath", () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "inari-base-path-"));
    await mkdir(join(root, ".next/static"), { recursive: true });
    await writeFile(
      join(root, "server.js"),
      `const config = {"basePath":"${BASE_PATH_PLACEHOLDER}"}`,
    );
    await writeFile(
      join(root, ".next/static/chunk.js"),
      `fetch("${BASE_PATH_PLACEHOLDER}/_next/data")`,
    );
    await writeFile(join(root, ".next/untouched.js"), "const a = 1;");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function run(basePath) {
    return applyBasePath({
      root,
      targets: ["server.js", ".next", "missing.js"],
      basePath,
    });
  }

  it("substitutes the placeholder across the whole tree", async () => {
    expect(await run("/dashboard")).toBe(2);
    expect(await readFile(join(root, "server.js"), "utf8")).toBe(
      'const config = {"basePath":"/dashboard"}',
    );
    expect(await readFile(join(root, ".next/static/chunk.js"), "utf8")).toBe(
      'fetch("/dashboard/_next/data")',
    );
  });

  it("removes the placeholder entirely when serving from the root", async () => {
    expect(await run("")).toBe(2);
    expect(await readFile(join(root, "server.js"), "utf8")).toBe(
      'const config = {"basePath":""}',
    );
  });

  it("leaves files without the placeholder alone and is idempotent", async () => {
    await run("/dashboard");
    expect(await readFile(join(root, ".next/untouched.js"), "utf8")).toBe(
      "const a = 1;",
    );
    expect(await run("/dashboard")).toBe(0);
  });

  it("substitutes a placeholder split across flight chunks in prerendered HTML", async () => {
    const boundary = '"])</script><script>self.__next_f.push([1,"';
    await writeFile(
      join(root, ".next/page.html"),
      `<script>self.__next_f.push([1,":HL[\\"/_${boundary}_inari_base_path__/_next/static/media/font.woff2\\"]"])</script>`,
    );
    await run("/dashboard");
    expect(await readFile(join(root, ".next/page.html"), "utf8")).toBe(
      '<script>self.__next_f.push([1,":HL[\\"/dashboard/_next/static/media/font.woff2\\"]"])</script>',
    );
  });

  it("preserves bytes that are not valid UTF-8", async () => {
    const binary = Buffer.concat([
      Buffer.from([0xff, 0xfe, 0x00]),
      Buffer.from(BASE_PATH_PLACEHOLDER),
      Buffer.from([0x80, 0x81]),
    ]);
    await writeFile(join(root, ".next/asset.bin"), binary);
    await run("/dashboard");
    expect(await readFile(join(root, ".next/asset.bin"))).toEqual(
      Buffer.concat([
        Buffer.from([0xff, 0xfe, 0x00]),
        Buffer.from("/dashboard"),
        Buffer.from([0x80, 0x81]),
      ]),
    );
  });
});
