import { redirect } from "next/navigation";
import { Stack } from "@chakra-ui/react";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { BucketSummary } from "@/domain/s3/models";
import { listBuckets } from "@/application/list_buckets";
import {
  createSessionStore,
  requireStorage,
} from "@/infrastructure/composition";
import { BucketList } from "@/components/s3/bucket_list";
import { UsagePanel } from "@/components/s3/usage_panel";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";

export const metadata = {
  title: "Buckets - Inari",
};

export default async function BucketsPage() {
  const storage = await requireStorage();
  const session = await createSessionStore().getSession();
  if (!session) {
    redirect("/connect");
  }

  // Only these two non-credential fields cross to the client. They scope a
  // cached scan to this connection, so reconnecting elsewhere cannot surface the
  // previous target's figures.
  const cacheStamp = {
    endpoint: session.connection.endpoint,
    sessionCreatedAt: session.createdAt.toISOString(),
  };

  let buckets: BucketSummary[] | undefined;
  let error: string | undefined;
  try {
    buckets = await listBuckets(storage);
  } catch (caught) {
    error =
      caught instanceof StorageError
        ? storageErrorMessage(caught.kind)
        : "Failed to load buckets";
  }

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
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : (
        <>
          {/* One listing feeds both the scanner's bucket set and the grid below;
              the usage screen used to fetch its own copy. Both are handed the
              same stamp so the cards can read the scan the panel writes.

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
