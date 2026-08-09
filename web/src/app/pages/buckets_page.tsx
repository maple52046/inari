import { useMemo } from "react";
import { HStack, Span, Stack } from "@chakra-ui/react";
import { listBucketsAction } from "@/api/actions";
import { reviveBucket } from "@/api/revive";
import { BucketList } from "@/components/s3/bucket_list";
import { useBucketScan } from "@/components/s3/use_bucket_scan";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";
import { formatSize } from "@/lib/format_size";
import { useResource } from "@/lib/use_resource";
import { useDocumentTitle } from "@/lib/use_document_title";
import { useSession } from "../session_context";
import { PageSkeleton } from "../page_skeleton";

/**
 * The bucket count with the measured total opposite it.
 *
 * The total is withheld until something has been measured: a scan is what
 * produces it, and "0 B" would read as an empty backend rather than an
 * unmeasured one. A figure covering only some buckets says so instead of
 * passing for the whole connection.
 */
function BucketsSummary({
  bucketCount,
  measuredCount,
  totalBytes,
}: {
  bucketCount: number;
  measuredCount: number;
  totalBytes: number;
}) {
  const size = (
    <Span color="fg" fontWeight="medium">
      {formatSize(totalBytes)}
    </Span>
  );

  return (
    <HStack justify="space-between" gap="4">
      <Span>
        {bucketCount} bucket{bucketCount === 1 ? "" : "s"} accessible.
      </Span>
      {measuredCount === 0 ? null : (
        <Span whiteSpace="nowrap">
          {measuredCount < bucketCount ? (
            <>
              {size} across {measuredCount} of {bucketCount} buckets
            </>
          ) : (
            <>Total usage {size}</>
          )}
        </Span>
      )}
    </HStack>
  );
}

export function BucketsPage() {
  useDocumentTitle("Buckets");
  const { session } = useSession();

  const listing = useResource(
    "buckets",
    async () => (await listBucketsAction()).map(reviveBucket),
    "Failed to load buckets",
  );

  // Only these two non-credential fields scope a cached scan to this
  // connection, so reconnecting elsewhere cannot surface the previous target's
  // figures.
  const cacheStamp = useMemo(
    () => ({
      endpoint: session?.endpoint ?? "",
      sessionCreatedAt: session?.createdAt ?? "",
    }),
    [session?.endpoint, session?.createdAt],
  );

  const buckets = listing.data;

  // Held here rather than inside the list, because the header reports the total
  // the same scan produces and the two must never disagree.
  const bucketNames = useMemo(
    () => (buckets ?? []).map((bucket) => bucket.name),
    [buckets],
  );
  const scan = useBucketScan(bucketNames, cacheStamp);
  const totalBytes = useMemo(
    () => scan.scopes.reduce((sum, scope) => sum + scope.totalSize, 0),
    [scan.scopes],
  );

  if (listing.loading) {
    return <PageSkeleton />;
  }

  return (
    <Stack gap="5">
      <PageHeader
        title="Buckets"
        description={
          buckets ? (
            <BucketsSummary
              bucketCount={buckets.length}
              measuredCount={scan.scopes.length}
              totalBytes={totalBytes}
            />
          ) : undefined
        }
      />
      {listing.error ? (
        <Alert variant="error">{listing.error}</Alert>
      ) : (
        /* The list owns the scan control and the chart as well as the cards,
           because the three interleave on one layout. Measuring a single bucket
           or folder lives in the object browser instead, where the location
           being measured is the one on screen. */
        <BucketList buckets={buckets ?? []} scan={scan} />
      )}
    </Stack>
  );
}
