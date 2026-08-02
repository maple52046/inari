"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  parseUsageCache,
  readRawUsageCache,
  subscribeToUsageCache,
} from "@/lib/usage_cache";
import type { UsageCacheStamp } from "@/lib/usage_cache";
import {
  getCapacityState,
  refreshCapacity,
  subscribeToCapacity,
} from "@/lib/capacity_store";
import type { UsageScope } from "@/domain/s3/models";
import { useSession } from "@/app/session_context";

/**
 * Usage figures ready to display, whatever produced them.
 *
 * The four states a caller has to be able to tell apart are all here, because
 * collapsing any pair of them misleads: never measured, measured and current,
 * measured but stale, and a scan currently running. A bucket absent from
 * `scopes` has never been measured, which is not the same as being empty.
 */
export interface UsageReading {
  /** Measured scopes only; an unmeasured one is omitted rather than zeroed. */
  scopes: UsageScope[];
  /** When the figures were measured; the oldest part decides. */
  scannedAt?: Date;
  /** Per-scope measurement times, for callers showing one row per scope. */
  scannedAtByScope: Map<string, Date>;
  /** Whether the figures come from the server-side index. */
  shared: boolean;
  /** Whether every visible scope has been measured at least once. */
  measured: boolean;
  /** Whether the figures should be refreshed. */
  stale: boolean;
  /** Whether a scan covering these figures is running. */
  scanning: boolean;
}

const NO_SCAN_TIMES: Map<string, Date> = new Map();

/**
 * The usage figures for this connection, from whichever source the deployment
 * provides.
 *
 * This is the seam between the two: with a shared server index the figures come
 * from there and survive a reload and are visible to every session, and without
 * one they come from the per-tab cache exactly as before. Callers do not branch
 * on the mode, so a component works either way.
 *
 * Reads go through `useSyncExternalStore` rather than an effect so several
 * components observing the same figures stay in step without state being lifted
 * into a provider.
 */
export function useCachedUsage(stamp: UsageCacheStamp): UsageReading {
  const { session } = useSession();
  const shared = session?.capacityIndex ?? false;

  const capacity = useSyncExternalStore(
    subscribeToCapacity,
    getCapacityState,
    getCapacityState,
  );

  useEffect(() => {
    if (shared) {
      void refreshCapacity();
    }
  }, [shared]);

  const raw = useSyncExternalStore(
    subscribeToUsageCache,
    readRawUsageCache,
    () => null,
  );
  // Depending on the stamp's fields rather than the object avoids re-deriving
  // whenever a caller passes a fresh object holding equal values.
  const { endpoint, sessionCreatedAt } = stamp;
  const cached = useMemo(
    () => parseUsageCache(raw, { endpoint, sessionCreatedAt }),
    [raw, endpoint, sessionCreatedAt],
  );

  return useMemo(() => {
    if (!shared) {
      return {
        scopes: cached?.scopes ?? [],
        scannedAt: cached?.scannedAt,
        scannedAtByScope: NO_SCAN_TIMES,
        shared: false,
        measured: cached !== undefined,
        stale: cached === undefined,
        scanning: false,
      };
    }

    const view = capacity.view;
    if (!view) {
      return {
        scopes: [],
        scannedAtByScope: NO_SCAN_TIMES,
        shared: true,
        measured: false,
        stale: true,
        scanning: capacity.loading,
      };
    }

    const measuredEntries = view.entries.filter((entry) => entry.measured);
    return {
      scopes: measuredEntries.map((entry) => ({
        scope: entry.name,
        totalSize: entry.totalSize,
        objectCount: entry.objectCount,
      })),
      scannedAt: view.scannedAt ? new Date(view.scannedAt) : undefined,
      scannedAtByScope: new Map(
        measuredEntries
          .filter((entry) => entry.scannedAt !== undefined)
          .map((entry) => [entry.name, new Date(entry.scannedAt!)]),
      ),
      shared: true,
      measured: view.measured,
      stale: view.stale,
      scanning: view.scanning,
    };
  }, [shared, cached, capacity]);
}
