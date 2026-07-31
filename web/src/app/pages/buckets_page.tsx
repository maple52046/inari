import { useMemo } from "react";
import { Stack } from "@chakra-ui/react";
import { listBucketsAction } from "@/api/actions";
import { reviveBucket } from "@/api/revive";
import { BucketList } from "@/components/s3/bucket_list";
import { UsagePanel } from "@/components/s3/usage_panel";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";
import { useResource } from "@/lib/use_resource";
import { useDocumentTitle } from "@/lib/use_document_title";
import { useSession } from "../session_context";
import { PageSkeleton } from "../page_skeleton";

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

  if (listing.loading) {
    return <PageSkeleton />;
  }

  const buckets = listing.data;

  return (
    <Stack gap="5">
      <PageHeader
        title="Buckets"
        description={
          buckets
            ? `${buckets.length} bucket${buckets.length === 1 ? "" : "s"} accessible.`
            : undefined
        }
      />
      {listing.error ? (
        <Alert variant="error">{listing.error}</Alert>
      ) : (
        <>
          {/* One listing feeds both the scanner's bucket set and the grid below.
              Both are handed the same stamp so the cards can read the scan the
              panel writes.

              Measuring a single bucket or folder lives in the object browser
              instead, where the location being measured is the one on screen. */}
          <UsagePanel
            availableBuckets={(buckets ?? []).map((entry) => entry.name)}
            cacheStamp={cacheStamp}
          />
          <BucketList buckets={buckets ?? []} cacheStamp={cacheStamp} />
        </>
      )}
    </Stack>
  );
}
