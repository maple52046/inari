"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCapacityAction,
  requestCapacityScanAction,
  scanPrefixUsageAction,
} from "@/api/actions";
import type { PrefixUsageEntry } from "@/domain/s3/usage";
import { POLL_INTERVAL_MS } from "@/lib/capacity_store";
import { useSession } from "@/app/session_context";

/** Folder sizes for one location, however the deployment produces them. */
export interface FolderUsage {
  /** Sizes keyed by full prefix, so a folder row can look itself up. */
  byPrefix: Map<string, PrefixUsageEntry>;
  /** Whether a measurement is under way. */
  measuring: boolean;
  /** Whether any figures have arrived. */
  measured: boolean;
  /** Why the last attempt failed, if it did. */
  error?: string;
  /**
   * Whether figures appear without being asked for.
   *
   * Drives the wording of the control: "measure" is an instruction where
   * nothing is shown yet, and "re-measure" where the server already keeps a
   * figure and the user is asking for a fresher one.
   */
  automatic: boolean;
  /** Measures the location, or asks the server to. */
  measure: () => Promise<void>;
}

const NO_FOLDERS: Map<string, PrefixUsageEntry> = new Map();

/**
 * Folder sizes for the location on screen.
 *
 * The seam for the object browser, mirroring the one the bucket page uses. With
 * a shared index the sizes are a lookup and appear on arrival; without one they
 * cost a walk of everything beneath the prefix, so nothing happens until the
 * user asks.
 */
export function useFolderUsage(bucket: string, prefix: string): FolderUsage {
  const { session } = useSession();
  const shared = session?.capacityIndex ?? false;

  const [entries, setEntries] = useState<PrefixUsageEntry[] | undefined>();
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | undefined>();
  /** Bumped to restart the read loop after asking for a fresh measurement. */
  const [readNonce, setReadNonce] = useState(0);

  useEffect(() => {
    if (!shared) {
      return undefined;
    }

    // Guards every state write, so a read still in flight when the user
    // navigates cannot land on the next location's listing.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function read(): Promise<void> {
      const result = await fetchCapacityAction({ bucket, prefix });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setError(result.message);
        setMeasuring(false);
        return;
      }

      setError(undefined);
      setEntries(
        result.view.entries.map((entry) => ({
          name: entry.name,
          isPrefix: true,
          totalSize: entry.totalSize,
          objectCount: entry.objectCount,
        })),
      );
      setMeasuring(result.view.scanning);

      if (result.view.stale || result.view.scanning) {
        timer = setTimeout(() => void read(), POLL_INTERVAL_MS);
      }
    }

    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shared, bucket, prefix, readNonce]);

  const measure = useCallback(async (): Promise<void> => {
    setError(undefined);
    setMeasuring(true);

    if (shared) {
      const requested = await requestCapacityScanAction({ bucket, prefix });
      if (!requested.ok) {
        setError(requested.message);
        setMeasuring(false);
        return;
      }
      // Restarting the read loop turns the queued work into a visible state
      // and carries the result in when it lands.
      setReadNonce((nonce) => nonce + 1);
      return;
    }

    const result = await scanPrefixUsageAction({ bucket, prefix });
    setMeasuring(false);
    if (!result.ok) {
      setEntries(undefined);
      setError(result.message);
      return;
    }
    setEntries(result.usage.entries);
  }, [shared, bucket, prefix]);

  // Keyed by full prefix because a measurement names children relative to the
  // location it covered. Only folders are taken: an object row already carries
  // its own size from the listing.
  const byPrefix = useMemo(() => {
    if (!entries) {
      return NO_FOLDERS;
    }
    const map = new Map<string, PrefixUsageEntry>();
    for (const entry of entries) {
      if (entry.isPrefix) {
        map.set(`${prefix}${entry.name}`, entry);
      }
    }
    return map;
  }, [entries, prefix]);

  return {
    byPrefix,
    measuring,
    measured: entries !== undefined,
    error,
    automatic: shared,
    measure,
  };
}
