import type { ProviderPlugin } from "@/domain/s3/ports";

/**
 * Placeholder MinIO provider plugin.
 *
 * v1 intentionally ships no MinIO-specific admin behaviour; this exists only to
 * exercise the {@link ProviderPlugin} seam and let the UI report configuration
 * state. Real admin operations are deferred to a later version.
 */
export class MinioPlugin implements ProviderPlugin {
  readonly id = "minio";
  readonly label = "MinIO";

  isConfigured(): boolean {
    return false;
  }
}
