import { StorageError } from "@/domain/s3/errors";
import type { StorageErrorKind } from "@/domain/s3/errors";

interface AwsLikeError {
  name?: string;
  code?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
  cause?: unknown;
}

function readAwsLike(error: unknown): AwsLikeError {
  if (typeof error === "object" && error !== null) {
    return error as AwsLikeError;
  }
  return {};
}

const TLS_ERROR_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
]);

function isTlsError(code: string, message: string): boolean {
  if (TLS_ERROR_CODES.has(code) || code.startsWith("ERR_TLS")) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes("certificate") ||
    lower.includes("self-signed") ||
    lower.includes("self signed")
  );
}

function isNetworkError(code: string): boolean {
  return [
    "ENOTFOUND",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ].includes(code);
}

/**
 * Normalizes an arbitrary thrown value into a {@link StorageError}.
 *
 * Inspects AWS SDK error names, HTTP status codes, and Node network/TLS codes
 * (including a nested `cause`). The original message is used only for
 * classification and never propagated verbatim to the UI.
 *
 * @param fallback - Kind to use when classification is inconclusive.
 */
export function toStorageError(
  error: unknown,
  fallback: StorageErrorKind = "unknown",
): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  const aws = readAwsLike(error);
  const cause = readAwsLike(aws.cause);
  const name = (aws.name ?? "").toString();
  const code = (aws.code ?? cause.code ?? "").toString();
  const message = (aws.message ?? cause.message ?? "").toString();
  const status = aws.$metadata?.httpStatusCode;

  const detail =
    [name, code, status ? `HTTP ${status}` : "", message]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim() || undefined;

  // Surface the underlying cause during development to aid diagnosis. Only
  // non-credential fields are logged; the secret is never part of these.
  if (process.env.NODE_ENV === "development") {
    console.error("[s3] storage error", { name, code, status, message });
  }

  const make = (kind: StorageErrorKind): StorageError =>
    new StorageError(kind, undefined, { detail });

  if (isTlsError(code, message)) {
    return make("tls_error");
  }
  if (isNetworkError(code)) {
    return make("endpoint_unreachable");
  }

  switch (name) {
    case "InvalidAccessKeyId":
    case "SignatureDoesNotMatch":
    case "InvalidToken":
    case "CredentialsProviderError":
      return make("invalid_credential");
    case "AccessDenied":
    case "AllAccessDisabled":
      return make("access_denied");
    case "NoSuchBucket":
    case "NoSuchKey":
    case "NotFound":
      return make("not_found");
    default:
      break;
  }

  if (status === 403) {
    return make("access_denied");
  }
  if (status === 404) {
    return make("not_found");
  }
  if (status === 401) {
    return make("invalid_credential");
  }

  return make(fallback);
}
