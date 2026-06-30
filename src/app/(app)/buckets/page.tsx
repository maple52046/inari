import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { BucketSummary } from "@/domain/s3/models";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { BucketList } from "@/components/s3/bucket_list";
import { Alert } from "@/components/ui/alert";

export const metadata = {
  title: "Buckets - S3 Manager",
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Buckets</h1>
        {buckets ? (
          <p className="text-muted-foreground text-sm">
            {buckets.length} bucket{buckets.length === 1 ? "" : "s"} accessible.
          </p>
        ) : null}
      </div>
      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : (
        <BucketList buckets={buckets ?? []} />
      )}
    </div>
  );
}
