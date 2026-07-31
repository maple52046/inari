import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router";
import { Stack } from "@chakra-ui/react";
import { loadObjectsAction } from "@/api/actions";
import { ObjectBrowser } from "@/components/s3/object_browser";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page_header";
import {
  DOWNLOAD_COOKIE,
  parseDownloadPreference,
} from "@/lib/download_preference";
import { useResource } from "@/lib/use_resource";
import { useDocumentTitle } from "@/lib/use_document_title";
import { useSession } from "../session_context";
import { PageSkeleton } from "../page_skeleton";

/** Reads a cookie set by the browser itself, such as the download preference. */
function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

export function BucketPage() {
  const { bucket: rawBucket } = useParams<{ bucket: string }>();
  const [searchParams] = useSearchParams();
  const { session } = useSession();

  const bucket = decodeURIComponent(rawBucket ?? "");
  const prefix = searchParams.get("prefix") ?? "";

  useDocumentTitle(bucket);

  const listing = useResource(
    `${bucket}\u0000${prefix}`,
    async () => {
      const result = await loadObjectsAction({ bucket, prefix });
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result.page;
    },
    "Failed to load objects",
  );

  const onRefresh = useCallback(() => listing.reload(), [listing]);

  if (listing.loading) {
    return <PageSkeleton />;
  }

  if (!listing.data) {
    return (
      <Stack gap="4">
        <PageHeader title={bucket} />
        <Alert variant="error">{listing.error ?? "Failed to load objects"}</Alert>
      </Stack>
    );
  }

  return (
    <ObjectBrowser
      // Remounting on a prefix change resets the accumulated pages, filters and
      // selection, which all describe the folder the user just left.
      key={prefix}
      bucket={bucket}
      prefix={prefix}
      initialPage={listing.data}
      endpoint={session?.endpoint ?? ""}
      forcePathStyle={session?.forcePathStyle ?? true}
      initialDownloadPreference={parseDownloadPreference(
        readCookie(DOWNLOAD_COOKIE),
      )}
      onRefresh={onRefresh}
    />
  );
}
