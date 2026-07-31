import type { UsageScope } from "@/domain/s3/models";

/** `sessionStorage` key holding the cached usage scan. */
export const USAGE_CACHE_KEY = "s3m_usage";

/**
 * Identifies the connection a cached scan belongs to.
 *
 * Deliberately built from non-credential fields only: `getPublicConnection()`
 * exists to keep credential material out of the browser, and a cache key is not
 * worth widening that for.
 */
export interface UsageCacheStamp {
  endpoint: string;
  /** ISO timestamp of the session's creation. */
  sessionCreatedAt: string;
}

/** A usage scan recovered from, or destined for, the cache. */
export interface CachedUsage {
  scopes: UsageScope[];
  scannedAt: Date;
}

function isUsageScope(value: unknown): value is UsageScope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const scope = value as Record<string, unknown>;
  return (
    typeof scope.scope === "string" &&
    typeof scope.totalSize === "number" &&
    Number.isFinite(scope.totalSize) &&
    typeof scope.objectCount === "number" &&
    Number.isFinite(scope.objectCount)
  );
}

/** Encodes a scan together with the stamp that scopes it to one connection. */
export function serializeUsageCache(
  stamp: UsageCacheStamp,
  usage: CachedUsage,
): string {
  return JSON.stringify({
    endpoint: stamp.endpoint,
    sessionCreatedAt: stamp.sessionCreatedAt,
    // `Date` has no JSON representation, so the round trip goes through ISO.
    scannedAt: usage.scannedAt.toISOString(),
    scopes: usage.scopes,
  });
}

/**
 * Decodes a cached scan, or returns undefined when it must not be used.
 *
 * Rejects anything whose stamp does not match the current connection, which is
 * what stops a previous connection's figures surfacing after reconnecting
 * elsewhere. Malformed input is also rejected rather than thrown on, so a
 * corrupted entry degrades to "no cache" instead of breaking the page.
 */
export function parseUsageCache(
  raw: string | null | undefined,
  stamp: UsageCacheStamp,
): CachedUsage | undefined {
  if (!raw) {
    return undefined;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof decoded !== "object" || decoded === null) {
    return undefined;
  }

  const stored = decoded as Record<string, unknown>;
  if (
    stored.endpoint !== stamp.endpoint ||
    stored.sessionCreatedAt !== stamp.sessionCreatedAt
  ) {
    return undefined;
  }
  if (!Array.isArray(stored.scopes) || !stored.scopes.every(isUsageScope)) {
    return undefined;
  }
  if (typeof stored.scannedAt !== "string") {
    return undefined;
  }
  const scannedAt = new Date(stored.scannedAt);
  if (Number.isNaN(scannedAt.getTime())) {
    return undefined;
  }

  return { scopes: stored.scopes, scannedAt };
}

/**
 * Reads the stored entry without decoding it.
 *
 * Returns the raw string so it can serve as a `useSyncExternalStore` snapshot: a
 * primitive is referentially stable across calls, where a freshly parsed object
 * would make React treat every read as a change.
 *
 * Yields null when storage is unavailable, which covers server rendering and
 * browsers that block storage access.
 */
export function readRawUsageCache(): string | null {
  try {
    return window.sessionStorage.getItem(USAGE_CACHE_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

/**
 * Subscribes to writes of the stored entry.
 *
 * The entry is shared by more than one component, so a scan finishing in one
 * place has to reach the others. Only writes from this tab are observed; the
 * `storage` event is not, because sessionStorage is not shared between tabs.
 */
export function subscribeToUsageCache(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Persists a scan for the remainder of the browser tab's lifetime. */
export function writeUsageCache(
  stamp: UsageCacheStamp,
  usage: CachedUsage,
): void {
  try {
    window.sessionStorage.setItem(
      USAGE_CACHE_KEY,
      serializeUsageCache(stamp, usage),
    );
  } catch {
    // A failed write only costs the user a re-scan, so it is not worth
    // surfacing.
  }
  for (const listener of [...listeners]) {
    listener();
  }
}
