import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import { listBuckets } from "@/application/list_buckets";
import { requireStorage } from "@/infrastructure/composition";
import { CleanupPlanner } from "@/components/cleanup/cleanup_planner";
import { Alert } from "@/components/ui/alert";

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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Cleanup Planner</h1>
        <p className="text-muted-foreground text-sm">
          Find files worth deleting to free space. Ranked oldest first, then
          largest. Time uses each object&apos;s last modified date.
        </p>
      </div>
      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : (
        <CleanupPlanner buckets={buckets} />
      )}
    </div>
  );
}
