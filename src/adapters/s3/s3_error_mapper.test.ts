import { describe, expect, it } from "vitest";
import { StorageError } from "@/domain/s3/errors";
import { toStorageError } from "./s3_error_mapper";

describe("toStorageError", () => {
  it("passes through existing StorageError instances", () => {
    const original = new StorageError("access_denied");
    expect(toStorageError(original)).toBe(original);
  });

  it("maps invalid credential error names", () => {
    expect(toStorageError({ name: "InvalidAccessKeyId" }).kind).toBe(
      "invalid_credential",
    );
    expect(toStorageError({ name: "SignatureDoesNotMatch" }).kind).toBe(
      "invalid_credential",
    );
  });

  it("maps not found and access denied", () => {
    expect(toStorageError({ name: "NoSuchBucket" }).kind).toBe("not_found");
    expect(toStorageError({ name: "AccessDenied" }).kind).toBe("access_denied");
  });

  it("maps network error codes to unreachable", () => {
    expect(toStorageError({ code: "ECONNREFUSED" }).kind).toBe(
      "endpoint_unreachable",
    );
  });

  it("maps TLS failures", () => {
    expect(
      toStorageError({ message: "unable to verify the first certificate" })
        .kind,
    ).toBe("tls_error");
  });

  it("maps HTTP status codes when the name is unknown", () => {
    expect(toStorageError({ $metadata: { httpStatusCode: 403 } }).kind).toBe(
      "access_denied",
    );
    expect(toStorageError({ $metadata: { httpStatusCode: 404 } }).kind).toBe(
      "not_found",
    );
  });

  it("falls back to the provided default", () => {
    expect(toStorageError({}, "pagination_failed").kind).toBe(
      "pagination_failed",
    );
  });
});
