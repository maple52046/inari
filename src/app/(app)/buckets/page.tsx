import { Stack } from "@chakra-ui/react";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { BucketSummary } from "@/domain/s3/models";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { BucketList } from "@/components/s3/bucket_list";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";

export const metadata = {
  title: "Buckets - Inari",
};

export default async function BucketsPage() {
  const storage = await requireStorage();

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
        <BucketList buckets={buckets ?? []} />
      )}
    </Stack>
  );
}
