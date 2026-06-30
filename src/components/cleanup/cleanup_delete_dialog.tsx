"use client";

import { useMemo, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import type { CleanupCandidate } from "@/domain/s3/cleanup";
import type { CleanupBucketDeleteResult } from "@/application/delete_cleanup";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { formatSize } from "@/lib/format_size";
import { deleteCleanupAction } from "@/app/(app)/cleanup/actions";

const CONFIRM_WORD = "DELETE";

interface BucketGroup {
  bucket: string;
  count: number;
  size: number;
}

function groupTargets(targets: CleanupCandidate[]): BucketGroup[] {
  const groups = new Map<string, BucketGroup>();
  for (const target of targets) {
    const existing = groups.get(target.bucket);
    if (existing) {
      existing.count += 1;
      existing.size += target.sizeBytes;
    } else {
      groups.set(target.bucket, {
        bucket: target.bucket,
        count: 1,
        size: target.sizeBytes,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Per-bucket confirmation + execution modal for cleanup deletion. */
export function CleanupDeleteDialog({
  open,
  targets,
  onClose,
  onDeleted,
}: {
  open: boolean;
  targets: CleanupCandidate[];
  onClose: () => void;
  onDeleted: (deletedIds: string[]) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [results, setResults] = useState<
    CleanupBucketDeleteResult[] | undefined
  >();

  const groups = useMemo(() => groupTargets(targets), [targets]);
  const totalSize = targets.reduce((sum, t) => sum + t.sizeBytes, 0);
  const confirmed = confirmText.trim() === CONFIRM_WORD;

  function close(): void {
    setConfirmText("");
    setDeleting(false);
    setError(undefined);
    setResults(undefined);
    onClose();
  }

  async function runDelete(): Promise<void> {
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    const response = await deleteCleanupAction(
      targets.map((t) => ({ bucket: t.bucket, key: t.key })),
    );
    setDeleting(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResults(response.results);
    const deletedIds = response.results.flatMap((bucketResult) =>
      bucketResult.deleted.map((key) => `${bucketResult.bucket}\u0000${key}`),
    );
    onDeleted(deletedIds);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={results ? "Deletion result" : "Delete selected objects"}
      footer={
        results ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={runDelete}
              disabled={!confirmed || deleting}
            >
              {deleting ? <Spinner /> : <Trash2 className="h-4 w-4" />}
              Delete {targets.length}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <div className="space-y-2 text-sm">
          {results.map((bucketResult) => (
            <div
              key={bucketResult.bucket}
              className="border-border rounded-md border px-3 py-2"
            >
              <p className="font-medium">{bucketResult.bucket}</p>
              <p className="text-muted-foreground text-xs">
                Deleted {bucketResult.deleted.length}, failed{" "}
                {bucketResult.failed.length}
              </p>
              {bucketResult.failed.length > 0 ? (
                <ul className="text-destructive mt-1 max-h-24 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {bucketResult.failed.map((failure) => (
                    <li key={failure.key}>
                      {failure.key} - {failure.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="bg-muted flex items-start gap-2 rounded-md px-3 py-2">
            <TriangleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are about to delete{" "}
              <span className="font-medium">{targets.length}</span> object
              {targets.length === 1 ? "" : "s"}. Estimated freed space:{" "}
              <span className="font-medium">{formatSize(totalSize)}</span>. This
              action may be irreversible.
            </p>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs">
              Buckets affected:
            </p>
            <ul className="border-border max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
              {groups.map((group) => (
                <li key={group.bucket} className="flex justify-between gap-2">
                  <span className="font-mono">{group.bucket}</span>
                  <span className="text-muted-foreground">
                    {group.count} object{group.count === 1 ? "" : "s"},{" "}
                    {formatSize(group.size)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs">
              Type <span className="font-mono font-semibold">DELETE</span> to
              confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      )}
    </Modal>
  );
}
