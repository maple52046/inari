import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { UsagePanel } from "@/components/s3/usage_panel";
import { Alert } from "@/components/ui/alert";

export const metadata = {
  title: "Usage - S3 Manager",
};

interface UsagePageProps {
  searchParams: Promise<{ bucket?: string }>;
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const { bucket: currentBucket } = await searchParams;
  const storage = await requireStorage();

  let availableBuckets: string[] = [];
  let loadError: string | undefined;
  try {
    availableBuckets = (await listBuckets(storage)).map(
      (bucket) => bucket.name,
    );
  } catch (error) {
    loadError =
      error instanceof StorageError
        ? storageErrorMessage(error.kind)
        : "Failed to load buckets";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="text-muted-foreground text-sm">
          Scan-based storage estimate across S3-compatible buckets.
        </p>
      </div>
      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : (
        <UsagePanel
          availableBuckets={availableBuckets}
          currentBucket={currentBucket}
        />
      )}
    </div>
  );
}
