import { cookies } from "next/headers";
import { Stack } from "@chakra-ui/react";
import { StorageError, storageErrorMessage } from "@/domain/s3/errors";
import type { ObjectListPage } from "@/domain/s3/models";
import { listObjects } from "@/application/list_objects";
import {
  getPublicConnection,
  requireStorage,
} from "@/infrastructure/composition";
import { ObjectBrowser } from "@/components/s3/object_browser";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";
import {
  DOWNLOAD_COOKIE,
  parseDownloadPreference,
} from "@/lib/download_preference";

interface BucketPageProps {
  params: Promise<{ bucket: string }>;
  searchParams: Promise<{ prefix?: string }>;
}

export async function generateMetadata({ params }: BucketPageProps) {
  const { bucket } = await params;
  return { title: `${decodeURIComponent(bucket)} - Inari` };
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
  const connection = await getPublicConnection();
  const cookieStore = await cookies();
  const downloadPreference = parseDownloadPreference(
    cookieStore.get(DOWNLOAD_COOKIE)?.value,
  );

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
      <Stack gap="4">
        <PageHeader title={bucket} />
        <Alert variant="error">{error ?? "Failed to load objects"}</Alert>
      </Stack>
    );
  }

  return (
    <ObjectBrowser
      key={prefix}
      bucket={bucket}
      prefix={prefix}
      initialPage={page}
      endpoint={connection?.endpoint ?? ""}
      forcePathStyle={connection?.forcePathStyle ?? true}
      initialDownloadPreference={downloadPreference}
    />
  );
}
