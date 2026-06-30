import type { S3Connection } from "../s3/models";

/** A live connection session with lifecycle metadata. */
export interface ConnectionSession {
  connection: S3Connection;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Port for persisting the active connection on the server side only.
 *
 * Implementations must keep the secret out of any browser-readable storage and
 * out of logs. The composition root provides a concrete adapter (encrypted
 * cookie session).
 */
export interface ConnectionSessionPort {
  /** Returns the active connection, or undefined when not connected. */
  getConnection(): Promise<S3Connection | undefined>;
  /** Returns the active session with metadata, or undefined. */
  getSession(): Promise<ConnectionSession | undefined>;
  save(connection: S3Connection): Promise<void>;
  clear(): Promise<void>;
}
