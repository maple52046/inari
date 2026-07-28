"use client";

import {
  Copy,
  ExternalLink,
  KeyRound,
  Link as LinkIcon,
  RefreshCw,
  X,
} from "lucide-react";
import type { ObjectSummary } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { Spinner } from "@/components/ui/spinner";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { useDownloadLinks } from "./download_link_context";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm break-all">{value}</p>
    </div>
  );
}

/** Download section: link type, full URL, and copy/open/regenerate actions. */
function DownloadSection({ objectKey }: { objectKey: string }) {
  const { linkFor, copy, open, regenerate, expiry } = useDownloadLinks();
  const link = linkFor(objectKey);
  const isPresigned = link.mode === "presigned";
  const generatedAt =
    link.expiresAt !== undefined ? link.expiresAt - expiry * 1000 : undefined;

  return (
    <div className="border-border space-y-2 border-t pt-4">
      <div className="flex items-center gap-2">
        {isPresigned ? (
          <KeyRound className="text-primary h-4 w-4" />
        ) : (
          <LinkIcon className="text-primary h-4 w-4" />
        )}
        <p className="text-sm font-medium">Download</p>
        <span className="text-muted-foreground text-xs">
          {isPresigned ? "Presigned" : "Direct"}
        </span>
      </div>

      {link.status === "loading" ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner /> Generating link…
        </p>
      ) : link.status === "error" ? (
        <p className="text-destructive text-sm">
          {link.message ?? "Failed to prepare download link"}
        </p>
      ) : link.status === "idle" ? (
        <p className="text-muted-foreground text-sm">
          No link yet. Copy, open, or generate one when you need it.
        </p>
      ) : (
        <p
          className="bg-muted rounded-md p-2 font-mono text-xs break-all"
          title={link.url}
        >
          {link.url}
        </p>
      )}

      {isPresigned && link.status === "ready" ? (
        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
          <Field
            label="Generated"
            value={formatDateTime(
              generatedAt !== undefined ? new Date(generatedAt) : undefined,
            )}
          />
          <Field
            label="Expires"
            value={formatDateTime(
              link.expiresAt ? new Date(link.expiresAt) : undefined,
            )}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(objectKey)}
          disabled={link.status === "loading"}
        >
          <Copy className="h-4 w-4" />
          Copy Link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => open(objectKey)}
          disabled={link.status === "loading"}
        >
          <ExternalLink className="h-4 w-4" />
          Open Link
        </Button>
        {isPresigned ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerate(objectKey)}
            disabled={link.status === "loading"}
          >
            <RefreshCw className="h-4 w-4" />
            {link.status === "idle" ? "Generate" : "Regenerate"}
          </Button>
        ) : null}
      </div>

      {!isPresigned ? (
        <p className="text-muted-foreground text-xs">
          Direct links require the object to allow anonymous read access.
        </p>
      ) : null}
    </div>
  );
}

/** Right-hand drawer showing full metadata and download links for one object. */
export function ObjectDetailDrawer({
  object,
  onClose,
}: {
  object: ObjectSummary | undefined;
  onClose: () => void;
}) {
  if (!object) {
    return null;
  }

  return (
    <div className="border-border bg-card fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l shadow-xl">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Object details</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Field label="Name" value={object.name} />
        <Field label="Key" value={object.key} />
        <Field
          label="Size"
          value={`${formatSize(object.size)} (${object.size} bytes)`}
        />
        <Field
          label="Last Modified"
          value={formatDateTime(object.lastModified)}
        />
        {object.storageClass ? (
          <Field label="Storage Class" value={object.storageClass} />
        ) : null}
        {object.etag ? <Field label="ETag" value={object.etag} /> : null}
        <DownloadSection objectKey={object.key} />
      </div>
      <div className="border-border flex gap-2 border-t px-4 py-3">
        <CopyButton value={object.key} label="Copy key" variant="outline" />
      </div>
    </div>
  );
}
