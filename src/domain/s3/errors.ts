/**
 * Domain error taxonomy for storage operations.
 *
 * The adapter layer normalizes SDK/network failures into a {@link StorageError}
 * carrying one of these kinds. The UI maps the kind to a safe, user-facing
 * message and must never surface raw SDK errors, stack traces, or credentials.
 */
export type StorageErrorKind =
  | "invalid_credential"
  | "endpoint_unreachable"
  | "tls_error"
  | "access_denied"
  | "not_found"
  | "delete_failed"
  | "pagination_failed"
  | "unknown";

/** Error thrown by storage ports and adapters for normalized failures. */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  /**
   * Non-sensitive underlying cause (SDK error name/code/message) for diagnosis.
   * Safe to show in development; never contains credentials.
   */
  readonly detail?: string;

  constructor(
    kind: StorageErrorKind,
    message?: string,
    options?: ErrorOptions & { detail?: string },
  ) {
    super(message ?? storageErrorMessage(kind), options);
    this.name = "StorageError";
    this.kind = kind;
    this.detail = options?.detail;
  }
}

/** Maps an error kind to a user-facing message (no credential leakage). */
export function storageErrorMessage(kind: StorageErrorKind): string {
  switch (kind) {
    case "invalid_credential":
      return "Credential is invalid or access denied";
    case "endpoint_unreachable":
      return "Cannot connect to S3 endpoint";
    case "tls_error":
      return "TLS connection failed";
    case "access_denied":
      return "You do not have permission to access this bucket";
    case "not_found":
      return "The requested bucket or object was not found";
    case "delete_failed":
      return "Some objects could not be deleted";
    case "pagination_failed":
      return "Failed to load next page";
    case "unknown":
      return "An unexpected storage error occurred";
  }
}
