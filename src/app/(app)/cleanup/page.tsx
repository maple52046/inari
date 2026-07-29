import { Stack } from "@chakra-ui/react";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { CleanupPlanner } from "@/components/cleanup/cleanup_planner";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";

export const metadata = {
  title: "Cleanup - Inari",
};

export default async function CleanupPage() {
  const storage = await requireStorage();

  let buckets: string[] = [];
  let loadError: string | undefined;
  try {
    buckets = (await listBuckets(storage)).map((bucket) => bucket.name);
  } catch (error) {
    loadError =
      error instanceof StorageError
        ? storageErrorMessage(error.kind)
        : "Failed to load buckets";
  }

  return (
    <Stack gap="5">
      <PageHeader
        title="Cleanup Planner"
        description="Find files worth deleting to free space. Ranked oldest first, then largest. Time uses each object's last modified date."
      />
      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : (
        <CleanupPlanner buckets={buckets} />
      )}
    </Stack>
  );
}
