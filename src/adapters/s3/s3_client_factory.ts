import { Agent } from "node:https";
import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { S3Connection } from "@/domain/s3/models";

/**
 * Builds an {@link S3Client} for a connection.
 *
 * Uses path-style addressing and an explicit endpoint so self-hosted
 * S3-compatible backends (e.g. MinIO) work without virtual-host bucket DNS.
 * When the connection opts out of TLS verification, an insecure HTTPS agent is
 * installed for this client only (does not affect global TLS settings).
 */
export function createS3Client(connection: S3Connection): S3Client {
  const requestHandler = connection.skipTlsVerification
    ? new NodeHttpHandler({
        httpsAgent: new Agent({ rejectUnauthorized: false }),
      })
    : undefined;

  return new S3Client({
    endpoint: connection.endpoint,
    region: connection.region,
    forcePathStyle: connection.forcePathStyle,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey,
    },
    ...(requestHandler ? { requestHandler } : {}),
  });
}
