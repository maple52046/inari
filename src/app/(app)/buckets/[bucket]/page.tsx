import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { ObjectListPage } from "@/domain/s3/models";
import { listObjects } from "@/application/list_objects";
import { requireStorage } from "@/infrastructure/composition";
import { ObjectBrowser } from "@/components/s3/object_browser";
import { Alert } from "@/components/ui/alert";

interface BucketPageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ prefix?: string }>;
}

export async function generateMetadata({ params }: BucketPageProps) {
  const { bucket } = await params;
  return { title: `${decodeURIComponent(bucket)} - S3 Manager` };
}

export default async function BucketPage({
  params,
  searchParams,
}: BucketPageProps) {
  const { bucket: rawBucket } = await params;
  const { prefix: rawPrefix } = await searchParams;
  const bucket = decodeURIComponent(rawBucket);
  const prefix = rawPrefix ?? "";

  const storage = await requireStorage();

  let page: ObjectListPage | undefined;
  let error: string | undefined;
  try {
    page = await listObjects(storage, { bucket, prefix });
  } catch (caught) {
    error =
      caught instanceof StorageError
        ? storageErrorMessage(caught.kind)
        : "Failed to load objects";
  }

  if (!page) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{bucket}</h1>
        <Alert variant="error">{error ?? "Failed to load objects"}</Alert>
      </div>
    );
  }

  return (
    <ObjectBrowser
      key={prefix}
      bucket={bucket}
      prefix={prefix}
      initialPage={page}
    />
  );
}
