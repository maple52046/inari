"use client";

import { useState } from "react";
import { HardDrive, ScanLine } from "lucide-react";
import type { UsageScope } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty_state";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { scanBucketAction } from "@/app/(app)/admin/usage/actions";

interface ScanFailure {
  bucket: string;
  message: string;
}

interface Progress {
  done: number;
  total: number;
}

/** Manual, scan-based usage estimator with per-bucket progress. */
export function UsagePanel({
  availableBuckets,
  currentBucket,
}: {
  availableBuckets: string[];
  currentBucket?: string;
}) {
  const [scopes, setScopes] = useState<UsageScope[]>([]);
  const [failures, setFailures] = useState<ScanFailure[]>([]);
  const [progress, setProgress] = useState<Progress | undefined>();
  const [scannedAt, setScannedAt] = useState<Date | undefined>();
  const scanning = progress !== undefined && progress.done < progress.total;

  async function scan(buckets: string[]): Promise<void> {
    if (buckets.length === 0) {
      return;
    }
    setScopes([]);
    setFailures([]);
    setProgress({ done: 0, total: buckets.length });
    const collected: UsageScope[] = [];
    const failed: ScanFailure[] = [];
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index]!;
      const result = await scanBucketAction(bucket);
      if (result.ok) {
        collected.push(result.scope);
        setScopes([...collected]);
      } else {
        failed.push({ bucket, message: result.message });
        setFailures([...failed]);
      }
      setProgress({ done: index + 1, total: buckets.length });
    }
    setScannedAt(new Date());
  }

  const totalSize = scopes.reduce((sum, scope) => sum + scope.totalSize, 0);
  const totalObjects = scopes.reduce(
    (sum, scope) => sum + scope.objectCount,
    0,
  );
  const showAggregate = scopes.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {currentBucket ? (
          <Button onClick={() => scan([currentBucket])} disabled={scanning}>
            <ScanLine className="h-4 w-4" />
            Scan {currentBucket}
          </Button>
        ) : null}
        <Button
          variant={currentBucket ? "outline" : "default"}
          onClick={() => scan(availableBuckets)}
          disabled={scanning || availableBuckets.length === 0}
        >
          <HardDrive className="h-4 w-4" />
          Scan all buckets ({availableBuckets.length})
        </Button>
      </div>

      {progress ? (
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            {scanning ? <Spinner /> : null}
            <span>
              Scanned {progress.done} of {progress.total} bucket
              {progress.total === 1 ? "" : "s"}
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{
                width: `${(progress.done / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {scopes.length === 0 && !scanning ? (
        <EmptyState
          icon={HardDrive}
          title="No usage scanned yet"
          description="Run a scan to estimate storage usage."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-2">Scope</th>
                  <th className="px-4 py-2 text-right">Size</th>
                  <th className="px-4 py-2 text-right">Objects</th>
                  <th className="px-4 py-2">Last Scanned</th>
                </tr>
              </thead>
              <tbody>
                {showAggregate ? (
                  <tr className="border-border border-t font-medium">
                    <td className="px-4 py-2">all buckets</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatSize(totalSize)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {totalObjects.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{formatDateTime(scannedAt)}</td>
                  </tr>
                ) : null}
                {scopes.map((scope) => (
                  <tr key={scope.scope} className="border-border border-t">
                    <td className="px-4 py-2">{scope.scope}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatSize(scope.totalSize)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {scope.objectCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{formatDateTime(scannedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {failures.length > 0 ? (
        <Alert variant="error">
          Failed to scan: {failures.map((failure) => failure.bucket).join(", ")}
        </Alert>
      ) : null}

      <Alert variant="warning">
        Usage is calculated by scanning visible objects through S3-compatible
        APIs. It may not include provider-specific overhead, incomplete
        multipart uploads, object versions, delete markers, or backend internal
        metadata.
      </Alert>
    </div>
  );
}
