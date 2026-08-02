"use client";

import { Suspense, lazy, useState } from "react";
import { HardDrive } from "lucide-react";
import {
  Box,
  Grid,
  HStack,
  Icon,
  Progress,
  Stack,
  Table,
  Text,
  Wrap,
} from "@chakra-ui/react";
import type { UsageScope } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
// Loaded on demand so the charting library stays out of the bucket homepage's
// bundle. The page is the app's entry point, and the chart only exists after a
// manual scan, so paying ~320KB up front on every visit would be wasteful.
const UsagePieChart = lazy(() =>
  import("./usage_pie_chart").then((module) => ({
    default: module.UsagePieChart,
  })),
);
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { writeUsageCache } from "@/lib/usage_cache";
import type { UsageCacheStamp } from "@/lib/usage_cache";
import { refreshCapacity } from "@/lib/capacity_store";
import { useCachedUsage } from "./use_cached_usage";
import { requestCapacityScanAction, scanBucketAction } from "@/api/actions";

interface ScanFailure {
  bucket: string;
  message: string;
}

interface ScanProgress {
  done: number;
  total: number;
}

/**
 * Scan-based usage estimator with per-bucket progress.
 *
 * Serves both shapes the deployment can take. Where the server keeps a shared
 * index the figures are already there on arrival and the button only asks for
 * them to be re-measured; where it does not, nothing is shown until a scan is
 * pressed, because a scan walks every object and merely opening the page must
 * not start one.
 */
export function UsagePanel({
  availableBuckets,
  cacheStamp,
}: {
  availableBuckets: string[];
  cacheStamp: UsageCacheStamp;
}) {
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
  const scopes = usingLiveScan ? liveScopes : usage.scopes;
  const scannedAt = usingLiveScan ? liveScannedAt : usage.scannedAt;

  const scanning = usage.shared
    ? usage.scanning || requesting
    : progress !== undefined && progress.done < progress.total;
  // The server reports that a scan is running, not how far along it is, so the
  // count of buckets already measured stands in for progress.
  const shownProgress = usage.shared
    ? scanning
      ? { done: usage.scopes.length, total: availableBuckets.length }
      : undefined
    : progress;

  async function scanEverything(): Promise<void> {
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

  const totalSize = scopes.reduce((sum, scope) => sum + scope.totalSize, 0);
  const totalObjects = scopes.reduce(
    (sum, scope) => sum + scope.objectCount,
    0,
  );
  const showAggregate = scopes.length > 1;
  const hasResults = scopes.length > 0;
  // A pie of nothing but zero-byte buckets has no slices, so the column would
  // otherwise reserve space for an empty card.
  const hasChart = scopes.some((scope) => scope.totalSize > 0);
  // A bucket the index has not reached yet is absent from the figures rather
  // than showing as empty, so the gap is named instead of being invisible.
  const unmeasured = usage.shared
    ? availableBuckets.length - usage.scopes.length
    : 0;

  return (
    <Stack gap="4">
      <Wrap gap="2">
        <Button
          onClick={() => scanEverything()}
          disabled={scanning || availableBuckets.length === 0}
        >
          <Icon size="sm" asChild>
            <HardDrive />
          </Icon>
          {usage.shared ? "Rescan" : "Scan"} all buckets (
          {availableBuckets.length})
        </Button>
      </Wrap>

      {shownProgress ? (
        <Progress.Root
          value={shownProgress.done}
          max={shownProgress.total}
          size="xs"
          striped={scanning}
          animated={scanning}
        >
          <HStack color="fg.muted" fontSize="sm" gap="2" mb="1">
            {scanning ? <Spinner size="xs" /> : null}
            <Progress.Label>
              Scanned {shownProgress.done} of {shownProgress.total} bucket
              {shownProgress.total === 1 ? "" : "s"}
            </Progress.Label>
          </HStack>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ) : null}

      {/* Nothing stands in for an un-scanned panel. It shares the bucket
          homepage, so a placeholder here would push the buckets down on every
          visit for a feature most visits do not use. */}
      {hasResults ? (
        <Grid
          templateColumns={{ base: "1fr", lg: hasChart ? "1fr 20rem" : "1fr" }}
          gap="4"
          alignItems="start"
        >
          {/* The table stays first in the DOM, so it is what a screen reader and
              the keyboard reach first. `order` is what moves the chart above it
              on narrow screens and beside it from lg up. */}
          <Card overflow="hidden" order={{ base: 1, lg: 0 }}>
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg="bg.muted">
                  <Table.ColumnHeader>Scope</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="end">Size</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="end">
                    Objects
                  </Table.ColumnHeader>
                  <Table.ColumnHeader>Last Scanned</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {showAggregate ? (
                  <Table.Row fontWeight="medium">
                    <Table.Cell>all buckets</Table.Cell>
                    <Table.Cell textAlign="end">
                      {formatSize(totalSize)}
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      {totalObjects.toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>{formatDateTime(scannedAt)}</Table.Cell>
                  </Table.Row>
                ) : null}
                {scopes.map((scope) => (
                  <Table.Row key={scope.scope}>
                    <Table.Cell>{scope.scope}</Table.Cell>
                    <Table.Cell textAlign="end">
                      {formatSize(scope.totalSize)}
                    </Table.Cell>
                    <Table.Cell textAlign="end">
                      {scope.objectCount.toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      {formatDateTime(
                        usage.scannedAtByScope.get(scope.scope) ?? scannedAt,
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Card>
          {hasChart ? (
            <Card order={{ base: 0, lg: 1 }}>
              <Box p="4">
                {/* The fallback reserves the chart's height so the card does
                    not collapse and reflow while the bundle arrives. */}
                <Suspense fallback={<Box height="17rem" />}>
                  <UsagePieChart scopes={scopes} />
                </Suspense>
              </Box>
            </Card>
          ) : null}
        </Grid>
      ) : null}

      {unmeasured > 0 && !scanning ? (
        <Alert variant="info">
          {unmeasured} bucket{unmeasured === 1 ? " has" : "s have"} not been
          measured yet.
        </Alert>
      ) : null}

      {failures.length > 0 ? (
        <Alert variant="error">
          Failed to scan: {failures.map((failure) => failure.bucket).join(", ")}
        </Alert>
      ) : null}

      {/* The estimate has to be qualified wherever it is shown, but with no
          result on screen there is nothing to qualify. */}
      {hasResults ? (
        <Alert variant="warning">
          <Text>
            Usage is calculated by scanning visible objects through
            S3-compatible APIs. It may not include provider-specific overhead,
            incomplete multipart uploads, object versions, delete markers, or
            backend internal metadata.
          </Text>
        </Alert>
      ) : null}
    </Stack>
  );
}
