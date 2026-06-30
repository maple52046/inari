import "server-only";
import { redirect } from "next/navigation";
import type {
  ObjectStorageFactory,
  ObjectStoragePort,
} from "@/domain/s3/ports";
import type { ConnectionSessionPort } from "@/domain/session/ports";
import type { ProviderPlugin } from "@/domain/s3/ports";
import { S3ObjectStorage } from "@/adapters/s3/s3_object_storage";
import { IronSessionStore } from "@/adapters/session/iron_session_store";
import { MinioPlugin } from "@/adapters/plugins/minio/minio_plugin";

/**
 * Composition root.
 *
 * The only module that names concrete adapters; everything else depends on
 * ports. Marked `server-only` so credential-bearing wiring can never be bundled
 * into client components.
 */

/** Factory binding the AWS SDK adapter to the storage port. */
export const createStorage: ObjectStorageFactory = (connection) =>
  new S3ObjectStorage(connection);

/** Returns the encrypted-cookie session store. */
export function createSessionStore(): ConnectionSessionPort {
  return new IronSessionStore();
}

/** Returns the provider plugins available to the app (MinIO placeholder). */
export function getProviderPlugins(): ProviderPlugin[] {
  return [new MinioPlugin()];
}

/**
 * Builds a storage port from the active session, or undefined when not
 * connected. Callers should redirect to `/connect` on undefined.
 */
export async function getStorageFromSession(): Promise<
  ObjectStoragePort | undefined
> {
  const connection = await createSessionStore().getConnection();
  return connection ? createStorage(connection) : undefined;
}

/**
 * Returns a storage port for the active session, redirecting to `/connect`
 * when there is none. For use in connected pages and actions.
 */
export async function requireStorage(): Promise<ObjectStoragePort> {
  const storage = await getStorageFromSession();
  if (!storage) {
    redirect("/connect");
  }
  return storage;
}
