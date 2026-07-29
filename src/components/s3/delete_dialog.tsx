"use client";

import { useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Box, HStack, Icon, List, Stack, Text } from "@chakra-ui/react";
import type { ObjectSummary } from "@/domain/s3/models";
import type { DeleteResult } from "@/domain/s3/models";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { formatSize } from "@/lib/format_size";
import { truncateMiddle } from "@/lib/truncate";
import { deleteObjectsAction } from "@/app/(app)/buckets/[bucket]/actions";

const CONFIRM_WORD = "DELETE";
const PREVIEW_LIMIT = 10;

/** Confirmation + execution modal for batch object deletion. */
export function DeleteDialog({
  open,
  bucket,
  targets,
  onClose,
  onDeleted,
}: {
  open: boolean;
  bucket: string;
  targets: ObjectSummary[];
  onClose: () => void;
  onDeleted: (result: DeleteResult) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<DeleteResult | undefined>();

  const totalSize = targets.reduce((sum, object) => sum + object.size, 0);
  const confirmed = confirmText.trim() === CONFIRM_WORD;

  function reset(): void {
    setConfirmText("");
    setDeleting(false);
    setError(undefined);
    setResult(undefined);
  }

  function close(): void {
    reset();
    onClose();
  }

  async function runDelete(): Promise<void> {
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    const response = await deleteObjectsAction({
      bucket,
      keys: targets.map((object) => object.key),
    });
    setDeleting(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.result);
    onDeleted(response.result);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? "Deletion result" : "Delete objects"}
      footer={
        result ? (
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
      {result ? (
        <Stack gap="3" fontSize="sm">
          <Text>
            Deleted{" "}
            <Text as="span" fontWeight="medium">
              {result.deleted.length}
            </Text>{" "}
            object{result.deleted.length === 1 ? "" : "s"}.
          </Text>
          {result.failed.length > 0 ? (
            <Stack gap="2">
              <Alert variant="error">
                {result.failed.length} object
                {result.failed.length === 1 ? "" : "s"} could not be deleted.
              </Alert>
              <List.Root
                variant="plain"
                maxH="40"
                overflowY="auto"
                fontFamily="mono"
                fontSize="xs"
                gap="1"
              >
                {result.failed.map((failure) => (
                  <List.Item key={failure.key} color="fg.error">
                    {truncateMiddle(failure.key, 60)} - {failure.message}
                  </List.Item>
                ))}
              </List.Root>
            </Stack>
          ) : null}
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
              <Text as="span" fontWeight="medium">
                {targets.length}
              </Text>{" "}
              object{targets.length === 1 ? "" : "s"} ({formatSize(totalSize)}).
              This operation may be irreversible.
            </Text>
          </HStack>

          <Box>
            <Text color="fg.muted" fontSize="xs" mb="1">
              Showing up to {PREVIEW_LIMIT} of {targets.length} keys:
            </Text>
            <List.Root
              variant="plain"
              maxH="40"
              overflowY="auto"
              borderWidth="1px"
              borderColor="border"
              borderRadius="l2"
              p="2"
              fontFamily="mono"
              fontSize="xs"
              gap="1"
            >
              {targets.slice(0, PREVIEW_LIMIT).map((object) => (
                <List.Item key={object.key} truncate>
                  {object.key}
                </List.Item>
              ))}
            </List.Root>
          </Box>

          <Box>
            <Text color="fg.muted" fontSize="xs" mb="1">
              Type{" "}
              <Text as="span" fontFamily="mono" fontWeight="semibold">
                DELETE
              </Text>{" "}
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
