"use client";

import { useState } from "react";
import { HardDrive, ScanLine } from "lucide-react";
import {
  HStack,
  Icon,
  Progress,
  Stack,
  Table,
  Text,
  Wrap,
} from "@chakra-ui/react";
import type { UsageScope } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

interface ScanProgress {
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
  const [progress, setProgress] = useState<ScanProgress | undefined>();
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
    <Stack gap="4">
      <Wrap gap="2">
        {currentBucket ? (
          <Button onClick={() => scan([currentBucket])} disabled={scanning}>
            <Icon size="sm" asChild>
              <ScanLine />
            </Icon>
            Scan {currentBucket}
          </Button>
        ) : null}
        <Button
          variant={currentBucket ? "outline" : "default"}
          onClick={() => scan(availableBuckets)}
          disabled={scanning || availableBuckets.length === 0}
        >
          <Icon size="sm" asChild>
            <HardDrive />
          </Icon>
          Scan all buckets ({availableBuckets.length})
        </Button>
      </Wrap>

      {progress ? (
        <Progress.Root
          value={progress.done}
          max={progress.total}
          size="xs"
          striped={scanning}
          animated={scanning}
        >
          <HStack color="fg.muted" fontSize="sm" gap="2" mb="1">
            {scanning ? <Spinner size="xs" /> : null}
            <Progress.Label>
              Scanned {progress.done} of {progress.total} bucket
              {progress.total === 1 ? "" : "s"}
            </Progress.Label>
          </HStack>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ) : null}

      {scopes.length === 0 && !scanning ? (
        <EmptyState
          icon={HardDrive}
          title="No usage scanned yet"
          description="Run a scan to estimate storage usage."
        />
      ) : (
        <Card overflow="hidden">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="bg.muted">
                <Table.ColumnHeader>Scope</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Size</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Objects</Table.ColumnHeader>
                <Table.ColumnHeader>Last Scanned</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {showAggregate ? (
                <Table.Row fontWeight="medium">
                  <Table.Cell>all buckets</Table.Cell>
                  <Table.Cell textAlign="end">
                    {formatSize(totalSize)}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {totalObjects.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell>{formatDateTime(scannedAt)}</Table.Cell>
                </Table.Row>
              ) : null}
              {scopes.map((scope) => (
                <Table.Row key={scope.scope}>
                  <Table.Cell>{scope.scope}</Table.Cell>
                  <Table.Cell textAlign="end">
                    {formatSize(scope.totalSize)}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {scope.objectCount.toLocaleString()}
                  </Table.Cell>
                  <Table.Cell>{formatDateTime(scannedAt)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
      )}

      {failures.length > 0 ? (
        <Alert variant="error">
          Failed to scan: {failures.map((failure) => failure.bucket).join(", ")}
        </Alert>
      ) : null}

      <Alert variant="warning">
        <Text>
          Usage is calculated by scanning visible objects through S3-compatible
          APIs. It may not include provider-specific overhead, incomplete
          multipart uploads, object versions, delete markers, or backend
          internal metadata.
        </Text>
      </Alert>
    </Stack>
  );
}
