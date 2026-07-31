import { Stack } from "@chakra-ui/react";
import { listBucketNamesAction } from "@/api/actions";
import { CleanupPlanner } from "@/components/cleanup/cleanup_planner";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";
import { useResource } from "@/lib/use_resource";
import { useDocumentTitle } from "@/lib/use_document_title";
import { PageSkeleton } from "../page_skeleton";

export function CleanupPage() {
  useDocumentTitle("Cleanup");

  const listing = useResource(
    "cleanup-buckets",
    async () => {
      const result = await listBucketNamesAction();
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.buckets;
    },
    "Failed to load buckets",
  );

  if (listing.loading) {
    return <PageSkeleton />;
  }

  return (
    <Stack gap="5">
      <PageHeader
        title="Cleanup Planner"
        description="Find files worth deleting to free space. Ranked oldest first, then largest. Time uses each object's last modified date."
      />
      {listing.error ? (
        <Alert variant="error">{listing.error}</Alert>
      ) : (
        <CleanupPlanner buckets={listing.data ?? []} />
      )}
    </Stack>
  );
}
