"use client";

import { useState } from "react";
import { File, Folder, ScanLine } from "lucide-react";
import { Box, HStack, Icon, Span, Table, Text } from "@chakra-ui/react";
import type { PrefixUsage } from "@/application/scan_prefix_usage";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { formatShare } from "@/lib/usage_slices";
import { scanPrefixUsageAction } from "@/app/(app)/buckets/[bucket]/actions";

/**
 * Breaks down what the location being browsed contains.
 *
 * Answers "what is taking up the space in here", so it lists each immediate
 * sub-folder and file rather than a single total for the location itself.
 *
 * Scanning walks every object beneath the prefix, so it only ever runs from the
 * button. The result is deliberately not cached: it belongs to the location on
 * screen, and persisting it would overwrite the connection-wide scan the bucket
 * homepage keeps.
 */
export function PrefixUsagePanel({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}) {
  const [scanning, setScanning] = useState(false);
  const [usage, setUsage] = useState<PrefixUsage | undefined>();
  const [scannedAt, setScannedAt] = useState<Date | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function scan(): Promise<void> {
    setScanning(true);
    setError(undefined);
    const result = await scanPrefixUsageAction({ bucket, prefix });
    setScanning(false);
    if (!result.ok) {
      setUsage(undefined);
      setError(result.message);
      return;
    }
    setUsage(result.usage);
    setScannedAt(new Date());
  }

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="l3"
      bg="bg.panel"
      shadow="xs"
      p="3"
    >
      <HStack justify="space-between" wrap="wrap" gap="2">
        <Box>
          <Text fontSize="sm" fontWeight="medium">
            What is in this location
          </Text>
          {usage ? (
            <Text color="fg.muted" fontSize="xs">
              {formatSize(usage.totalSize)} across{" "}
              {usage.objectCount.toLocaleString()} object
              {usage.objectCount === 1 ? "" : "s"} · scanned{" "}
              {formatDateTime(scannedAt)}
            </Text>
          ) : null}
        </Box>
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? (
            <Spinner size="sm" />
          ) : (
            <Icon size="sm" asChild>
              <ScanLine />
            </Icon>
          )}
          {scanning ? "Scanning…" : usage ? "Rescan" : "Scan this location"}
        </Button>
      </HStack>

      {usage && usage.entries.length > 0 ? (
        <Box
          mt="3"
          borderWidth="1px"
          borderColor="border"
          borderRadius="l2"
          overflow="hidden"
        >
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row bg="bg.muted">
                <Table.ColumnHeader>Name</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Size</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Share</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="end">Objects</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {usage.entries.map((entry) => (
                <Table.Row key={entry.name}>
                  <Table.Cell>
                    <HStack gap="2" minW="0">
                      <Icon
                        size="sm"
                        color={entry.isPrefix ? "brand.solid" : "fg.muted"}
                        flexShrink="0"
                        asChild
                      >
                        {entry.isPrefix ? <Folder /> : <File />}
                      </Icon>
                      <Span fontFamily="mono" wordBreak="break-all">
                        {entry.name}
                      </Span>
                    </HStack>
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {formatSize(entry.totalSize)}
                  </Table.Cell>
                  <Table.Cell textAlign="end" color="fg.muted">
                    {/* Guarded because a location holding only empty objects has
                        a zero total and no shares to speak of. */}
                    {usage.totalSize > 0
                      ? formatShare(entry.totalSize / usage.totalSize)
                      : "-"}
                  </Table.Cell>
                  <Table.Cell textAlign="end">
                    {entry.objectCount.toLocaleString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      ) : null}

      {usage && usage.entries.length === 0 ? (
        <Text color="fg.muted" fontSize="sm" mt="3">
          Nothing beneath this location.
        </Text>
      ) : null}

      {error ? (
        <Box mt="3">
          <Alert variant="error">{error}</Alert>
        </Box>
      ) : null}

      {/* The estimate is qualified wherever it is shown, and only there. */}
      {usage ? (
        <Box mt="3">
          <Alert variant="warning">
            <Text>
              Counted by listing objects beneath this location. Excludes
              provider-specific overhead, incomplete multipart uploads, object
              versions, delete markers, and backend internal metadata.
            </Text>
          </Alert>
        </Box>
      ) : null}
    </Box>
  );
}
