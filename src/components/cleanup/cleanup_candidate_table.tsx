"use client";

import { Trash2 } from "lucide-react";
import type { CleanupCandidate } from "@/domain/s3/cleanup";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { truncateMiddle } from "@/lib/truncate";
import { CleanupReasonBadge } from "./cleanup_reason_badge";

interface CleanupCandidateTableProps {
  candidates: CleanupCandidate[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  idOf: (candidate: CleanupCandidate) => string;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDeleteOne: (candidate: CleanupCandidate) => void;
}

/** Ranked cleanup candidates with selection and per-row actions. */
export function CleanupCandidateTable({
  candidates,
  selected,
  allSelected,
  idOf,
  onToggle,
  onToggleAll,
  onDeleteOne,
}: CleanupCandidateTableProps) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground text-left">
          <tr>
            <th className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onToggleAll(event.target.checked)}
                aria-label="Select all candidates"
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
            </th>
            <th className="px-3 py-2">Bucket</th>
            <th className="px-3 py-2">Key</th>
            <th className="px-3 py-2 text-right">Size</th>
            <th className="px-3 py-2">Last Modified</th>
            <th className="px-3 py-2">Storage Class</th>
            <th className="px-3 py-2">Cleanup Reason</th>
            <th className="w-24 px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => {
            const id = idOf(candidate);
            return (
              <tr
                key={id}
                className="border-border hover:bg-accent/50 border-t"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => onToggle(id)}
                    aria-label={`Select ${candidate.key}`}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {candidate.bucket}
                </td>
                <td className="px-3 py-2 font-mono" title={candidate.key}>
                  {truncateMiddle(candidate.key, 48)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatSize(candidate.sizeBytes)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateTime(candidate.lastModified)}
                </td>
                <td className="text-muted-foreground px-3 py-2">
                  {candidate.storageClass ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {candidate.reasons.map((reason) => (
                      <CleanupReasonBadge key={reason} reason={reason} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <CopyButton
                      value={candidate.key}
                      label=""
                      aria-label="Copy key"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteOne(candidate)}
                      aria-label={`Delete ${candidate.key}`}
                      title="Delete"
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
