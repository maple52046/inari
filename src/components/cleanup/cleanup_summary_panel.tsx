import {
  Flex,
  Heading,
  Span,
  Stack,
  StackSeparator,
  Text,
} from "@chakra-ui/react";
import type { CleanupPlanSummary } from "@/domain/s3/cleanup";
import { Card } from "@/components/ui/card";
import { formatSize } from "@/lib/format_size";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap="4" py="1" fontSize="sm">
      <Span color="fg.muted">{label}</Span>
      <Span>{value}</Span>
    </Flex>
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
      <Stack p="4" gap="2">
        <Heading as="h2" size="md" fontFamily="heading" fontWeight="700">
          Summary
        </Heading>
        {summary ? (
          <Stack gap="0" separator={<StackSeparator />}>
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
          </Stack>
        ) : (
          <Text color="fg.muted" fontSize="sm">
            Run a scan to see cleanup candidates.
          </Text>
        )}
      </Stack>
    </Card>
  );
}
