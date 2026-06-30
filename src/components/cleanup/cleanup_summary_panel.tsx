import type { CleanupPlanSummary } from "@/domain/s3/cleanup";
import { Card, CardContent } from "@/components/ui/card";
import { formatSize } from "@/lib/format_size";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Fixed summary of scan totals and current selection. */
export function CleanupSummaryPanel({
  summary,
  selectedCount,
  selectedSize,
}: {
  summary?: CleanupPlanSummary;
  selectedCount: number;
  selectedSize: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-2 font-semibold">Summary</h2>
        {summary ? (
          <div className="divide-border divide-y">
            <Row
              label="Scanned buckets"
              value={summary.scannedBuckets.toLocaleString()}
            />
            <Row
              label="Scanned objects"
              value={summary.scannedObjects.toLocaleString()}
            />
            <Row
              label="Candidate objects"
              value={summary.candidateCount.toLocaleString()}
            />
            <Row
              label="Candidate total size"
              value={formatSize(summary.candidateTotalSize)}
            />
            <Row
              label="Selected objects"
              value={selectedCount.toLocaleString()}
            />
            <Row label="Selected size" value={formatSize(selectedSize)} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Run a scan to see cleanup candidates.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
