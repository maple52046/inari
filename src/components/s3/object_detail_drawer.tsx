"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import type { ObjectSummary } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { Spinner } from "@/components/ui/spinner";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { downloadUrlAction } from "@/app/(app)/buckets/[bucket]/actions";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm break-all">{value}</p>
    </div>
  );
}

/** Right-hand drawer showing full metadata for one object. */
export function ObjectDetailDrawer({
  bucket,
  object,
  onClose,
}: {
  bucket: string;
  object: ObjectSummary | undefined;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function download(): Promise<void> {
    if (!object) {
      return;
    }
    setDownloading(true);
    setError(undefined);
    const result = await downloadUrlAction({ bucket, key: object.key });
    setDownloading(false);
    if (result.ok) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      setError(result.message);
    }
  }

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
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
      <div className="border-border flex gap-2 border-t px-4 py-3">
        <Button onClick={download} disabled={downloading}>
          {downloading ? <Spinner /> : <Download className="h-4 w-4" />}
          Download
        </Button>
        <CopyButton value={object.key} label="Copy key" variant="outline" />
      </div>
    </div>
  );
}
