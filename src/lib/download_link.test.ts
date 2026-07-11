import { describe, expect, it } from "vitest";
import { buildDirectUrl } from "./download_link";

describe("buildDirectUrl", () => {
  it("builds a path-style URL with endpoint, bucket, and key", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://s3.example.com",
        forcePathStyle: true,
        bucket: "models",
        key: "qwen/model.gguf",
      }),
    ).toBe("https://s3.example.com/models/qwen/model.gguf");
  });

  it("avoids duplicate slashes when the endpoint has a trailing slash", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://s3.example.com/",
        forcePathStyle: true,
        bucket: "b",
        key: "a.txt",
      }),
    ).toBe("https://s3.example.com/b/a.txt");
  });

  it("preserves prefix hierarchy while encoding each segment", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://s3.example.com",
        forcePathStyle: true,
        bucket: "b",
        key: "dir/sub dir/файл 名字.bin",
      }),
    ).toBe(
      "https://s3.example.com/b/dir/sub%20dir/%D1%84%D0%B0%D0%B9%D0%BB%20%E5%90%8D%E5%AD%97.bin",
    );
  });

  it("encodes special characters that would break the path", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://s3.example.com",
        forcePathStyle: true,
        bucket: "b",
        key: "a+b&c?d=e.txt",
      }),
    ).toBe("https://s3.example.com/b/a%2Bb%26c%3Fd%3De.txt");
  });

  it("builds a virtual-host URL when path style is disabled", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://s3.example.com",
        forcePathStyle: false,
        bucket: "models",
        key: "qwen/model.gguf",
      }),
    ).toBe("https://models.s3.example.com/qwen/model.gguf");
  });

  it("keeps an endpoint base path in virtual-host mode", () => {
    expect(
      buildDirectUrl({
        endpoint: "https://gw.example.com/s3",
        forcePathStyle: false,
        bucket: "b",
        key: "a.txt",
      }),
    ).toBe("https://b.gw.example.com/s3/a.txt");
  });
});
