"use client";

import { Label } from "@/components/ui/label";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Chooses the scan scope: all buckets or one bucket. Prefix is reserved. */
export function CleanupScopeSelector({
  buckets,
  bucket,
  onBucketChange,
  disabled,
}: {
  buckets: string[];
  bucket: string;
  onBucketChange: (bucket: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="cleanup-bucket">Bucket</Label>
        <select
          id="cleanup-bucket"
          value={bucket}
          onChange={(event) => onBucketChange(event.target.value)}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">All buckets</option>
          {buckets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="cleanup-prefix">Prefix</Label>
        <input
          id="cleanup-prefix"
          disabled
          placeholder="Coming soon"
          className={`${selectClass} cursor-not-allowed opacity-60`}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Prefix-based cleanup is planned for a future version.
        </p>
      </div>
    </div>
  );
}
