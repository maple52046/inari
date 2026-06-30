"use client";

import Link from "next/link";
import { File, Folder, Trash2 } from "lucide-react";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { truncateMiddle } from "@/lib/truncate";

function prefixHref(bucket: string, prefix: string): string {
  return `/buckets/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`;
}

interface ObjectCardListProps {
  bucket: string;
  prefixes: CommonPrefix[];
  objects: ObjectSummary[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onOpenDetail: (object: ObjectSummary) => void;
  onDeleteOne: (object: ObjectSummary) => void;
}

/** Mobile card view of prefixes (folders) and objects. */
export function ObjectCardList({
  bucket,
  prefixes,
  objects,
  selected,
  onToggle,
  onOpenDetail,
  onDeleteOne,
}: ObjectCardListProps) {
  return (
    <div className="space-y-2">
      {prefixes.map((entry) => (
        <Link key={entry.prefix} href={prefixHref(bucket, entry.prefix)}>
          <Card className="hover:border-primary flex items-center gap-2 p-3">
            <Folder className="text-primary h-5 w-5" />
            <span className="font-medium">{entry.name}/</span>
          </Card>
        </Link>
      ))}
      {objects.map((object) => (
        <Card key={object.key} className="p-3">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selected.has(object.key)}
              onChange={() => onToggle(object.key)}
              aria-label={`Select ${object.name}`}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={() => onOpenDetail(object)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <File className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate font-mono text-sm">
                  {truncateMiddle(object.name, 36)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatSize(object.size)} ·{" "}
                {formatDateTime(object.lastModified)}
              </p>
            </button>
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <CopyButton value={object.key} label="Copy" variant="outline" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteOne(object)}
              aria-label={`Delete ${object.name}`}
            >
              <Trash2 className="text-destructive h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
