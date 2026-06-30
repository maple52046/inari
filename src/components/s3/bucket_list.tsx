"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, Search } from "lucide-react";
import type { BucketSummary } from "@/domain/s3/models";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty_state";
import { formatDateTime } from "@/lib/date";

/** Searchable grid of buckets linking into the object browser. */
export function BucketList({ buckets }: { buckets: BucketSummary[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return buckets;
    }
    return buckets.filter((bucket) =>
      bucket.name.toLowerCase().includes(trimmed),
    );
  }, [buckets, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search buckets"
          className="pl-9"
          aria-label="Search buckets"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No buckets found"
          description={
            buckets.length === 0
              ? "This connection has no accessible buckets."
              : "No buckets match your search."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((bucket) => (
            <Link
              key={bucket.name}
              href={`/buckets/${encodeURIComponent(bucket.name)}`}
            >
              <Card className="hover:border-primary hover:bg-accent flex items-center gap-3 p-4 transition-colors">
                <Database className="text-primary h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{bucket.name}</p>
                  {bucket.createdAt ? (
                    <p className="text-muted-foreground text-xs">
                      Created {formatDateTime(bucket.createdAt)}
                    </p>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
