"use client";

import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import type { ObjectSummary } from "@/domain/s3/models";
import type { DeleteResult } from "@/domain/s3/models";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { formatSize } from "@/lib/format_size";
import { truncateMiddle } from "@/lib/truncate";
import { deleteObjectsAction } from "@/app/(app)/buckets/[bucket]/actions";

const CONFIRM_WORD = "DELETE";
const PREVIEW_LIMIT = 10;

/** Confirmation + execution modal for batch object deletion. */
export function DeleteDialog({
  open,
  bucket,
  targets,
  onClose,
  onDeleted,
}: {
  open: boolean;
  bucket: string;
  targets: ObjectSummary[];
  onClose: () => void;
  onDeleted: (result: DeleteResult) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<DeleteResult | undefined>();

  const totalSize = targets.reduce((sum, object) => sum + object.size, 0);
  const confirmed = confirmText.trim() === CONFIRM_WORD;

  function reset(): void {
    setConfirmText("");
    setDeleting(false);
    setError(undefined);
    setResult(undefined);
  }

  function close(): void {
    reset();
    onClose();
  }

  async function runDelete(): Promise<void> {
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    const response = await deleteObjectsAction({
      bucket,
      keys: targets.map((object) => object.key),
    });
    setDeleting(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.result);
    onDeleted(response.result);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? "Deletion result" : "Delete objects"}
      footer={
        result ? (
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
      {result ? (
        <div className="space-y-3 text-sm">
          <p>
            Deleted <span className="font-medium">{result.deleted.length}</span>{" "}
            object{result.deleted.length === 1 ? "" : "s"}.
          </p>
          {result.failed.length > 0 ? (
            <div>
              <Alert variant="error">
                {result.failed.length} object
                {result.failed.length === 1 ? "" : "s"} could not be deleted.
              </Alert>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                {result.failed.map((failure) => (
                  <li key={failure.key} className="text-destructive">
                    {truncateMiddle(failure.key, 60)} - {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="bg-muted flex items-start gap-2 rounded-md px-3 py-2">
            <TriangleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are about to delete{" "}
              <span className="font-medium">{targets.length}</span> object
              {targets.length === 1 ? "" : "s"} ({formatSize(totalSize)}). This
              operation may be irreversible.
            </p>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs">
              Showing up to {PREVIEW_LIMIT} of {targets.length} keys:
            </p>
            <ul className="border-border max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 font-mono text-xs">
              {targets.slice(0, PREVIEW_LIMIT).map((object) => (
                <li key={object.key} className="truncate">
                  {object.key}
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
