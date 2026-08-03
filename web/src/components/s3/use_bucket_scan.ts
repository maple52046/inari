"use client";

import { useState } from "react";
import type { UsageScope } from "@/domain/s3/models";
import { writeUsageCache } from "@/lib/usage_cache";
import type { UsageCacheStamp } from "@/lib/usage_cache";
import { refreshCapacity } from "@/lib/capacity_store";
import { requestCapacityScanAction, scanBucketAction } from "@/api/actions";
import { useCachedUsage } from "./use_cached_usage";

/** A bucket whose scan did not complete. */
export interface ScanFailure {
  bucket: string;
  message: string;
}

/** How far a scan has got, for the progress bar. */
export interface ScanProgress {
  done: number;
  total: number;
}

/** Everything the bucket page needs to show and drive usage figures. */
export interface BucketScan {
  /** Measured scopes; an unmeasured bucket is absent rather than zeroed. */
  scopes: UsageScope[];
  /** When the figures were measured; the oldest part decides. */
  scannedAt?: Date;
  /** Per-scope measurement times, for a row that shows its own. */
  scannedAtByScope: Map<string, Date>;
  /** Whether the figures come from the server-side index. */
  shared: boolean;
  /** Whether a scan is under way. */
  scanning: boolean;
  /** Progress, absent when nothing is running. */
  progress?: ScanProgress;
  /** Buckets whose scan failed, cleared at the start of the next one. */
  failures: ScanFailure[];
  /** Visible buckets the figures do not cover yet. */
  unmeasured: number;
  /** Measures every visible bucket, or asks the server to. */
  scan: () => Promise<void>;
}

/**
 * Drives a scan of every visible bucket and reports its figures.
 *
 * Extracted from the view because the page interleaves these figures with the
 * bucket grid -- the chart beside it, the control above it -- so the layout
 * cannot be split along the same seam as the logic.
 *
 * Serves both shapes the deployment can take. Where the server keeps a shared
 * index the figures are already there on arrival and the control only asks for
 * them to be re-measured; where it does not, nothing is measured until the
 * control is pressed, because a scan walks every object and merely opening the
 * page must not start one.
 */
export function useBucketScan(
  availableBuckets: string[],
  cacheStamp: UsageCacheStamp,
): BucketScan {
  const [liveScopes, setLiveScopes] = useState<UsageScope[]>([]);
  const [failures, setFailures] = useState<ScanFailure[]>([]);
  const [progress, setProgress] = useState<ScanProgress | undefined>();
  const [liveScannedAt, setLiveScannedAt] = useState<Date | undefined>();
  const [requesting, setRequesting] = useState(false);

  const usage = useCachedUsage(cacheStamp);

  // A scan on this mount supersedes the per-tab cache, which only seeds a fresh
  // mount. `progress` becoming defined is what marks the handover. A shared
  // index needs none of this: the server has already stored the results.
  const usingLiveScan = !usage.shared && progress !== undefined;

  const scanning = usage.shared
    ? usage.scanning || requesting
    : progress !== undefined && progress.done < progress.total;

  async function scanLocally(buckets: string[]): Promise<void> {
    if (buckets.length === 0) {
      return;
    }
    setLiveScopes([]);
    setProgress({ done: 0, total: buckets.length });
    const collected: UsageScope[] = [];
    const failed: ScanFailure[] = [];
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index]!;
      // No prefix here: this scan spans the connection, and a prefix would be
      // applied to every bucket in it.
      const result = await scanBucketAction(bucket);
      if (result.ok) {
        collected.push(result.scope);
        setLiveScopes([...collected]);
      } else {
        failed.push({ bucket, message: result.message });
        setFailures([...failed]);
      }
      setProgress({ done: index + 1, total: buckets.length });
    }
    const finishedAt = new Date();
    setLiveScannedAt(finishedAt);
    // Only the results are cached; a failure list would mislead after a reload
    // and progress is transient by nature.
    writeUsageCache(cacheStamp, { scopes: collected, scannedAt: finishedAt });
  }

  async function scan(): Promise<void> {
    setFailures([]);
    if (usage.shared) {
      setRequesting(true);
      const result = await requestCapacityScanAction();
      if (!result.ok) {
        setFailures([{ bucket: "all buckets", message: result.message }]);
      }
      // Reading straight back turns the queued work into a visible "scanning"
      // state, and starts the polling that carries the results in.
      await refreshCapacity();
      setRequesting(false);
      return;
    }
    await scanLocally(availableBuckets);
  }

  return {
    scopes: usingLiveScan ? liveScopes : usage.scopes,
    scannedAt: usingLiveScan ? liveScannedAt : usage.scannedAt,
    scannedAtByScope: usage.scannedAtByScope,
    shared: usage.shared,
    scanning,
    // The server reports that a scan is running, not how far along it is, so
    // the count of buckets already measured stands in for progress.
    progress: usage.shared
      ? scanning
        ? { done: usage.scopes.length, total: availableBuckets.length }
        : undefined
      : progress,
    failures,
    // A bucket the index has not reached yet is absent from the figures rather
    // than showing as empty, so the gap is named instead of being invisible.
    unmeasured: usage.shared
      ? availableBuckets.length - usage.scopes.length
      : 0,
    scan,
  };
}
