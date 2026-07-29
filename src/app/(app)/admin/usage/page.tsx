import { Stack } from "@chakra-ui/react";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { UsagePanel } from "@/components/s3/usage_panel";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";

export const metadata = {
  title: "Usage - Inari",
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
    <Stack gap="5">
      <PageHeader
        title="Usage"
        description="Scan-based storage estimate across S3-compatible buckets."
      />
      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : (
        <UsagePanel
          availableBuckets={availableBuckets}
          currentBucket={currentBucket}
        />
      )}
    </Stack>
  );
}
