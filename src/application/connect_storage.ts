import type {
  ObjectStorageFactory,
  ObjectStoragePort,
} from "@/domain/s3/ports";
import type { ConnectionSessionPort } from "@/domain/session/ports";
import type { S3Connection } from "@/domain/s3/models";

/** Collaborators required to establish a connection. */
export interface ConnectStorageDeps {
  createStorage: ObjectStorageFactory;
  session: ConnectionSessionPort;
}

/**
 * Validates a candidate connection against the backend, then persists it.
 *
 * The connection is only saved after {@link ObjectStoragePort.testConnection}
 * succeeds, so a stored session always represents working credentials.
 *
 * @throws StorageError when the backend rejects the connection.
 */
export async function connectStorage(
  deps: ConnectStorageDeps,
  connection: S3Connection,
): Promise<void> {
  const storage: ObjectStoragePort = deps.createStorage(connection);
  await storage.testConnection();
  await deps.session.save(connection);
}

/**
 * Validates a candidate connection without persisting it.
 *
 * @throws StorageError when the backend rejects the connection.
 */
export async function testStorageConnection(
  createStorage: ObjectStorageFactory,
  connection: S3Connection,
): Promise<void> {
  await createStorage(connection).testConnection();
}
