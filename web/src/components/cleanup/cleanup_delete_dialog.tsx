"use client";

import { useMemo, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import {
  Box,
  Flex,
  HStack,
  Icon,
  List,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { CleanupCandidate } from "@/domain/s3/cleanup";
import type { CleanupBucketDeleteResult } from "@/domain/s3/cleanup";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { formatSize } from "@/lib/format_size";
import { deleteCleanupAction } from "@/api/actions";

const CONFIRM_WORD = "DELETE";

interface BucketGroup {
  bucket: string;
  count: number;
  size: number;
}

function groupTargets(targets: CleanupCandidate[]): BucketGroup[] {
  const groups = new Map<string, BucketGroup>();
  for (const target of targets) {
    const existing = groups.get(target.bucket);
    if (existing) {
      existing.count += 1;
      existing.size += target.sizeBytes;
    } else {
      groups.set(target.bucket, {
        bucket: target.bucket,
        count: 1,
        size: target.sizeBytes,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Per-bucket confirmation + execution modal for cleanup deletion. */
export function CleanupDeleteDialog({
  open,
  targets,
  onClose,
  onDeleted,
}: {
  open: boolean;
  targets: CleanupCandidate[];
  onClose: () => void;
  onDeleted: (deletedIds: string[]) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [results, setResults] = useState<
    CleanupBucketDeleteResult[] | undefined
  >();

  const groups = useMemo(() => groupTargets(targets), [targets]);
  const totalSize = targets.reduce((sum, t) => sum + t.sizeBytes, 0);
  const confirmed = confirmText.trim() === CONFIRM_WORD;

  function close(): void {
    setConfirmText("");
    setDeleting(false);
    setError(undefined);
    setResults(undefined);
    onClose();
  }

  async function runDelete(): Promise<void> {
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    const response = await deleteCleanupAction(
      targets.map((t) => ({ bucket: t.bucket, key: t.key })),
    );
    setDeleting(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResults(response.results);
    const deletedIds = response.results.flatMap((bucketResult) =>
      bucketResult.deleted.map((key) => `${bucketResult.bucket}\u0000${key}`),
    );
    onDeleted(deletedIds);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={results ? "Deletion result" : "Delete selected objects"}
      footer={
        results ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={runDelete}
              disabled={!confirmed || deleting}
            >
              {deleting ? (
                <Spinner size="sm" />
              ) : (
                <Icon size="sm" asChild>
                  <Trash2 />
                </Icon>
              )}
              Delete {targets.length}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <Stack gap="2" fontSize="sm">
          {results.map((bucketResult) => (
            <Box
              key={bucketResult.bucket}
              borderWidth="1px"
              borderColor="border"
              borderRadius="l2"
              px="3"
              py="2"
            >
              <Text fontWeight="medium">{bucketResult.bucket}</Text>
              <Text color="fg.muted" fontSize="xs">
                Deleted {bucketResult.deleted.length}, failed{" "}
                {bucketResult.failed.length}
              </Text>
              {bucketResult.failed.length > 0 ? (
                <List.Root
                  variant="plain"
                  color="fg.error"
                  mt="1"
                  maxH="24"
                  overflowY="auto"
                  fontFamily="mono"
                  fontSize="xs"
                  gap="0.5"
                >
                  {bucketResult.failed.map((failure) => (
                    <List.Item key={failure.key}>
                      {failure.key} - {failure.message}
                    </List.Item>
                  ))}
                </List.Root>
              ) : null}
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack gap="4" fontSize="sm">
          <HStack
            align="flex-start"
            gap="2"
            bg="bg.muted"
            px="3"
            py="2"
            borderRadius="l2"
          >
            <Icon size="sm" color="fg.error" mt="0.5" asChild>
              <TriangleAlert />
            </Icon>
            <Text>
              You are about to delete{" "}
              <Span fontWeight="medium">{targets.length}</Span> object
              {targets.length === 1 ? "" : "s"}. Estimated freed space:{" "}
              <Span fontWeight="medium">{formatSize(totalSize)}</Span>. This
              action may be irreversible.
            </Text>
          </HStack>

          <Box>
            <Text color="fg.muted" fontSize="xs" mb="1">
              Buckets affected:
            </Text>
            <List.Root
              variant="plain"
              maxH="40"
              overflowY="auto"
              borderWidth="1px"
              borderColor="border"
              borderRadius="l2"
              p="2"
              fontSize="xs"
              gap="1"
            >
              {groups.map((group) => (
                <List.Item key={group.bucket}>
                  <Flex justify="space-between" gap="2" width="full">
                    <Span fontFamily="mono">{group.bucket}</Span>
                    <Span color="fg.muted">
                      {group.count} object{group.count === 1 ? "" : "s"},{" "}
                      {formatSize(group.size)}
                    </Span>
                  </Flex>
                </List.Item>
              ))}
            </List.Root>
          </Box>

          <Box>
            <Text color="fg.muted" fontSize="xs" mb="1">
              Type{" "}
              <Span fontFamily="mono" fontWeight="semibold">
                DELETE
              </Span>{" "}
              to confirm:
            </Text>
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </Box>

          {error ? <Alert variant="error">{error}</Alert> : null}
        </Stack>
      )}
    </Modal>
  );
}
