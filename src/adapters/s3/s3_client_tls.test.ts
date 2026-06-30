import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import type { Server } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StorageError } from "@/domain/s3/errors";
import type { S3Connection } from "@/domain/s3/models";
import { S3ObjectStorage } from "./s3_object_storage";

// Minimal valid ListBuckets response so a successful TLS handshake yields a
// parseable result rather than a deserialization error.
const LIST_BUCKETS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
  "<Owner><ID>test</ID><DisplayName>test</DisplayName></Owner>" +
  "<Buckets></Buckets></ListAllMyBucketsResult>";

let server: Server;
let endpoint: string;
let workDir: string;

function connection(overrides: Partial<S3Connection>): S3Connection {
  return {
    endpoint,
    accessKeyId: "AKIATEST",
    secretAccessKey: "secret",
    region: "us-east-1",
    forcePathStyle: true,
    skipTlsVerification: false,
    ...overrides,
  };
}

beforeAll(async () => {
  // Bound SDK retries so the self-signed failure path returns quickly.
  process.env.AWS_MAX_ATTEMPTS = "1";
  workDir = mkdtempSync(join(tmpdir(), "s3m-tls-"));
  const keyPath = join(workDir, "key.pem");
  const certPath = join(workDir, "cert.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
  ]);

  server = createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(LIST_BUCKETS_XML);
    },
  );
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to bind test server");
  }
  endpoint = `https://localhost:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(workDir, { recursive: true, force: true });
});

describe("S3 client TLS verification", () => {
  it("rejects a self-signed certificate when verification is on", async () => {
    const storage = new S3ObjectStorage(
      connection({ skipTlsVerification: false }),
    );
    await expect(storage.listBuckets()).rejects.toMatchObject({
      kind: "tls_error",
    });
  });

  it("connects through TLS when verification is skipped", async () => {
    const storage = new S3ObjectStorage(
      connection({ skipTlsVerification: true }),
    );
    // Resolving at all proves the self-signed handshake was accepted; the empty
    // bucket list confirms the response was parsed end to end.
    await expect(storage.listBuckets()).resolves.toEqual([]);
  });

  it("classifies the self-signed failure as a StorageError", async () => {
    const storage = new S3ObjectStorage(
      connection({ skipTlsVerification: false }),
    );
    await expect(storage.listBuckets()).rejects.toBeInstanceOf(StorageError);
  });
});
