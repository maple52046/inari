"use client";

import { Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router";
import { Database, HardDrive, ListFilter } from "lucide-react";
import {
  Box,
  Grid,
  HStack,
  Icon,
  InputGroup,
  Progress,
  SimpleGrid,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { BucketSummary } from "@/domain/s3/models";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty_state";
import { formatDateTime } from "@/lib/date";
import { formatSize } from "@/lib/format_size";
import { formatShare, toUsageByBucket } from "@/lib/usage_slices";
import type { BucketUsage } from "@/lib/usage_slices";
import type { BucketScan } from "./use_bucket_scan";
// Loaded on demand so the charting library stays out of the bucket homepage's
// bundle. The page is the app's entry point and the chart is supplementary, so
// paying ~320KB up front on every visit would be wasteful.
const UsagePieChart = lazy(() =>
  import("./usage_pie_chart").then((module) => ({
    default: module.UsagePieChart,
  })),
);

/** Stands in for any figure a scan has not produced yet. */
const NO_VALUE = "-";

/**
 * Width of the chart column.
 *
 * The toolbar above the content uses the same track, so the search box spans
 * the cards and the button spans the chart. Defined once because the two rows
 * only read as one layout while they agree.
 */
const CHART_COLUMN = "20rem";

/**
 * Usage footer for a card.
 *
 * Every field is always present, so an unscanned bucket reads as "not measured"
 * rather than looking like a card that renders differently. Only the share bar is
 * withheld, since an empty track carries no information.
 *
 * The bar is decorative; the percentage beside it is what conveys the share to
 * anyone not reading the graphic.
 */
function UsageFooter({
  usage,
  scannedAt,
}: {
  usage?: BucketUsage;
  scannedAt?: Date;
}) {
  return (
    <Box borderTopWidth="1px" borderColor="border" px="4" py="3">
      <HStack justify="space-between" fontSize="xs" mb="2">
        <Span fontWeight="medium">
          {usage ? formatSize(usage.bytes) : NO_VALUE}
        </Span>
        <Span color="fg.muted">
          {usage
            ? `${usage.objectCount.toLocaleString()} object${usage.objectCount === 1 ? "" : "s"}`
            : `${NO_VALUE} objects`}
        </Span>
      </HStack>
      {usage ? (
        <HStack gap="2" mb="2">
          <Box
            flex="1"
            height="1"
            borderRadius="full"
            bg="bg.muted"
            overflow="hidden"
          >
            <Box
              height="full"
              borderRadius="full"
              bg="brand.solid"
              width={`${usage.share * 100}%`}
            />
          </Box>
          <Span color="fg.muted" minW="2.5rem" textAlign="right">
            {formatShare(usage.share)}
          </Span>
        </HStack>
      ) : null}
      <HStack justify="space-between" fontSize="xs" color="fg.muted">
        <Span>Last scanned</Span>
        {/* `formatDateTime` renders an em dash for an absent date, which is this
            app's convention in tables. Cards use a plain hyphen throughout so
            every unmeasured field looks the same. */}
        <Span>{usage ? formatDateTime(scannedAt) : NO_VALUE}</Span>
      </HStack>
    </Box>
  );
}

/**
 * The bucket homepage: searchable cards, the scan control, and the usage chart.
 *
 * One component rather than a list beside a usage panel, because the two
 * interleave: the control sits on the search row and the chart beside the grid.
 * Splitting them would mean a layout that neither could own.
 *
 * The scan itself is passed in rather than started here, because the page
 * header reports the same total and both must move together.
 */
export function BucketList({
  buckets,
  scan,
}: {
  buckets: BucketSummary[];
  scan: BucketScan;
}) {
  const [nameFilter, setNameFilter] = useState("");
  // Narrows a list that is already complete: the bucket listing arrives in one
  // call, so nothing here is fetched and nothing is left out.
  const filtered = useMemo(() => {
    const trimmed = nameFilter.trim().toLowerCase();
    if (!trimmed) {
      return buckets;
    }
    return buckets.filter((bucket) =>
      bucket.name.toLowerCase().includes(trimmed),
    );
  }, [buckets, nameFilter]);

  const usageByBucket = useMemo(
    () => toUsageByBucket(scan.scopes),
    [scan.scopes],
  );

  // The usage card carries the figures and the caveat that qualifies them, so
  // it appears whenever there are figures at all.
  const hasResults = scan.scopes.length > 0;
  // A pie of nothing but zero-byte buckets has no slices to draw. The card
  // still belongs there, because those zeroes are exactly what the caveat
  // explains: an incomplete multipart upload holds bytes a list scan cannot see.
  const hasChart = scan.scopes.some((scope) => scope.totalSize > 0);

  // `minmax(0, ...)` rather than `1fr`, so a long bucket name cannot widen the
  // first column and push what follows off the row.
  const contentColumns = {
    base: "1fr",
    xl: hasResults ? `minmax(0, 1fr) ${CHART_COLUMN}` : "1fr",
  };
  // Tracks the content below wherever there is a split to track. Narrower than
  // xl the card sits under the grid, so there is nothing to line up with and
  // the button falls back to its own width.
  const toolbarColumns = {
    base: "1fr",
    md: "minmax(0, 1fr) auto",
    xl: hasResults ? `minmax(0, 1fr) ${CHART_COLUMN}` : "minmax(0, 1fr) auto",
  };

  return (
    <Stack gap="4">
      <Grid templateColumns={toolbarColumns} gap="4" alignItems="center">
        <InputGroup
          startElement={
            <Icon size="sm" color="fg.muted" asChild>
              <ListFilter />
            </Icon>
          }
        >
          <Input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter buckets by name"
          />
        </InputGroup>
        <Button
          width="full"
          onClick={() => scan.scan()}
          disabled={scan.scanning || buckets.length === 0}
        >
          <Icon size="sm" asChild>
            <HardDrive />
          </Icon>
          {scan.shared ? "Rescan" : "Scan"} all buckets ({buckets.length})
        </Button>
      </Grid>

      {scan.progress ? (
        <Progress.Root
          value={scan.progress.done}
          max={scan.progress.total}
          size="xs"
          striped={scan.scanning}
          animated={scan.scanning}
        >
          <HStack color="fg.muted" fontSize="sm" gap="2" mb="1">
            {scan.scanning ? <Spinner size="xs" /> : null}
            <Progress.Label>
              Scanned {scan.progress.done} of {scan.progress.total} bucket
              {scan.progress.total === 1 ? "" : "s"}
            </Progress.Label>
          </HStack>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ) : null}

      {scan.unmeasured > 0 && !scan.scanning ? (
        <Alert variant="info">
          {scan.unmeasured} bucket{scan.unmeasured === 1 ? " has" : "s have"}{" "}
          not been measured yet.
        </Alert>
      ) : null}

      {scan.failures.length > 0 ? (
        <Alert variant="error">
          Failed to scan:{" "}
          {scan.failures.map((failure) => failure.bucket).join(", ")}
        </Alert>
      ) : null}

      <Grid templateColumns={contentColumns} gap="4" alignItems="start">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No buckets found"
            description={
              buckets.length === 0
                ? "This connection has no accessible buckets."
                : "No buckets match that name."
            }
          />
        ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, "2xl": 3 }} gap="4">
            {filtered.map((bucket) => {
              const bucketUsage = usageByBucket.get(bucket.name);
              return (
                <Link
                  key={bucket.name}
                  to={`/buckets/${encodeURIComponent(bucket.name)}`}
                >
                  <Card
                    height="full"
                    display="flex"
                    flexDirection="column"
                    transition="border-color 0.15s, box-shadow 0.15s"
                    _hover={{ borderColor: "brand.solid", shadow: "md" }}
                  >
                    <Stack gap="3" px="4" pt="4" pb="4" flex="1">
                      <HStack
                        align="center"
                        justify="center"
                        boxSize="9"
                        borderRadius="l2"
                        bg="brand.muted"
                        flexShrink="0"
                      >
                        <Icon size="md" color="brand.solid" asChild>
                          <Database />
                        </Icon>
                      </HStack>
                      <Box minW="0">
                        <Text
                          truncate
                          fontWeight="semibold"
                          title={bucket.name}
                        >
                          {bucket.name}
                        </Text>
                        <Text color="fg.muted" fontSize="xs">
                          {bucket.createdAt
                            ? `Created ${formatDateTime(bucket.createdAt)}`
                            : "Creation date unavailable"}
                        </Text>
                      </Box>
                    </Stack>
                    <UsageFooter
                      usage={bucketUsage}
                      scannedAt={
                        scan.scannedAtByScope.get(bucket.name) ?? scan.scannedAt
                      }
                    />
                  </Card>
                </Link>
              );
            })}
          </SimpleGrid>
        )}

        {hasResults ? (
          <Card>
            {hasChart ? (
              <Box p="4">
                {/* The fallback reserves the chart's height so the card does
                    not collapse and reflow while the bundle arrives. */}
                <Suspense fallback={<Box height="17rem" />}>
                  <UsagePieChart scopes={scan.scopes} />
                </Suspense>
              </Box>
            ) : null}
            {/* The caveat rides with the figures it qualifies rather than
                standing between the toolbar and the grid, which cost the page a
                full-width row for a sentence that belongs to this card. */}
            <Box
              borderTopWidth={hasChart ? "1px" : undefined}
              borderColor="border"
              px="4"
              py="3"
            >
              <Text fontSize="xs" color="fg.muted">
                Usage is calculated by scanning visible objects through
                S3-compatible APIs. It may not include provider-specific
                overhead, incomplete multipart uploads, object versions, delete
                markers, or backend internal metadata.
              </Text>
            </Box>
          </Card>
        ) : null}
      </Grid>
    </Stack>
  );
}
