"use client";

import Link from "next/link";
import { CircleQuestionMark, File, Folder, Trash2 } from "lucide-react";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { lastPathSegment } from "@/lib/object_path";
import { truncateMiddle } from "@/lib/truncate";
import { DownloadLinkActions, OpenLinkButton } from "./download_link_actions";
import { useDownloadLinks } from "./download_link_context";

function prefixHref(bucket: string, prefix: string): string {
  return `/buckets/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`;
}

/** Precondition a direct link cannot satisfy on its own, surfaced on hover. */
const DIRECT_LINK_HINT =
  "Direct links require the object to allow anonymous read access.";

interface ObjectTableProps {
  bucket: string;
  prefixes: CommonPrefix[];
  objects: ObjectSummary[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  showStorageClass: boolean;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenDetail: (object: ObjectSummary) => void;
  onDeleteOne: (object: ObjectSummary) => void;
}

/** Desktop table view of prefixes (folders) and objects. */
export function ObjectTable({
  bucket,
  prefixes,
  objects,
  selected,
  allSelected,
  showStorageClass,
  onToggle,
  onToggleAll,
  onOpenDetail,
  onDeleteOne,
}: ObjectTableProps) {
  // Naming the active mode in the header tells the user what the row's URL
  // actually is, since direct and presigned links are not interchangeable.
  const { mode } = useDownloadLinks();
  const urlColumnLabel =
    mode === "presigned" ? "URL (Presigned)" : "URL (Direct)";
  // A folder row spans every column except the leading checkbox, so the span
  // has to follow the optional Storage Class column.
  const folderColSpan = showStorageClass ? 6 : 5;

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
                aria-label="Select all loaded objects"
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
            </th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Size</th>
            <th className="px-3 py-2">Last Modified</th>
            {showStorageClass ? (
              <th className="px-3 py-2">Storage Class</th>
            ) : null}
            <th className="px-3 py-2">
              <span className="inline-flex items-center gap-1">
                {urlColumnLabel}
                {mode === "direct" ? (
                  <span
                    role="img"
                    aria-label={DIRECT_LINK_HINT}
                    title={DIRECT_LINK_HINT}
                    className="cursor-help"
                  >
                    <CircleQuestionMark className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </span>
            </th>
            <th className="w-32 px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {prefixes.map((entry) => (
            <tr key={entry.prefix} className="border-border border-t">
              <td className="px-3 py-2" />
              <td className="px-3 py-2" colSpan={folderColSpan}>
                <Link
                  href={prefixHref(bucket, entry.prefix)}
                  className="hover:text-primary flex items-center gap-2 font-medium"
                >
                  <Folder className="text-primary h-4 w-4" />
                  {entry.name}/
                </Link>
              </td>
            </tr>
          ))}
          {objects.map((object) => {
            const isSelected = selected.has(object.key);
            return (
              <tr
                key={object.key}
                className="border-border hover:bg-accent/50 border-t"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(object.key)}
                    aria-label={`Select ${object.name}`}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                </td>
                <td className="px-3 py-2">
                  {/* The copy control is a sibling, not a child, of the detail
                      button: nested buttons are invalid markup. */}
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(object)}
                      className="hover:text-primary flex min-w-0 items-center gap-2 text-left"
                      title={object.key}
                    >
                      <File className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="font-mono">
                        {truncateMiddle(object.name, 52)}
                      </span>
                    </button>
                    <CopyButton
                      value={lastPathSegment(object.key)}
                      label=""
                      size="icon"
                      aria-label={`Copy filename of ${object.name}`}
                      title="Copy filename"
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatSize(object.size)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateTime(object.lastModified)}
                </td>
                {showStorageClass ? (
                  <td className="text-muted-foreground px-3 py-2">
                    {object.storageClass ?? "—"}
                  </td>
                ) : null}
                <td className="max-w-[16rem] px-3 py-2">
                  <DownloadLinkActions
                    objectKey={object.key}
                    showOpen={false}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <OpenLinkButton objectKey={object.key} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteOne(object)}
                      aria-label={`Delete ${object.name}`}
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
