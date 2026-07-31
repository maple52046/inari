"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  parseUsageCache,
  readRawUsageCache,
  subscribeToUsageCache,
} from "@/lib/usage_cache";
import type { CachedUsage, UsageCacheStamp } from "@/lib/usage_cache";

/**
 * The last completed scan for this connection, or undefined when there is none.
 *
 * Reads through `useSyncExternalStore` rather than an effect so the server
 * snapshot is empty and hydration matches, without writing state from an effect.
 * The snapshot is the raw stored string: a primitive stays referentially stable
 * across reads, where a freshly parsed object would look like a change every
 * time.
 */
export function useCachedUsage(
  stamp: UsageCacheStamp,
): CachedUsage | undefined {
  const raw = useSyncExternalStore(
    subscribeToUsageCache,
    readRawUsageCache,
    () => null,
  );
  // Depending on the stamp's fields rather than the object avoids re-deriving
  // whenever a caller passes a fresh object holding equal values.
  const { endpoint, sessionCreatedAt } = stamp;
  return useMemo(
    () => parseUsageCache(raw, { endpoint, sessionCreatedAt }),
    [raw, endpoint, sessionCreatedAt],
  );
}
