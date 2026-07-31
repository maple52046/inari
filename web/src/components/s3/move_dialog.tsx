"use client";

import { useEffect, useMemo, useState } from "react";
import { CornerLeftUp, Folder, FolderInput } from "lucide-react";
import {
  Box,
  HStack,
  Icon,
  List,
  NativeSelect,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import type {
  CommonPrefix,
  MoveResult,
  ObjectSummary,
} from "@/domain/s3/models";
import type { MoveEntry } from "@/domain/s3/move";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import {
  joinObjectPath,
  lastPathSegment,
  parentPrefix,
} from "@/lib/object_path";
import { truncateMiddle } from "@/lib/truncate";
import {
  listBucketNamesAction,
  loadObjectsAction,
  moveObjectsAction,
} from "@/api/actions";

const PREVIEW_LIMIT = 10;

/**
 * Delay before the folder browser follows the typed path.
 *
 * The browser lists whatever the destination field holds, so without this every
 * keystroke would issue a listing request.
 */
const BROWSE_DEBOUNCE_MS = 250;

/** Destination picker and executor for relocating objects. */
export function MoveDialog({
  open,
  bucket,
  prefix,
  targets,
  onClose,
  onMoved,
}: {
  open: boolean;
  bucket: string;
  prefix: string;
  targets: ObjectSummary[];
  onClose: () => void;
  onMoved: (result: MoveResult, destinationBucket: string) => void;
}) {
  // Undefined means untouched, so the fields track the object the dialog was
  // opened for without an effect to re-seed them on every open.
  const [chosenBucket, setChosenBucket] = useState<string | undefined>();
  const [typedFolder, setTypedFolder] = useState<string | undefined>();
  const [typedName, setTypedName] = useState<string | undefined>();

  const [buckets, setBuckets] = useState<string[]>([bucket]);
  const [folders, setFolders] = useState<CommonPrefix[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | undefined>();

  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<MoveResult | undefined>();

  const single = targets.length === 1 ? targets[0] : undefined;
  const destinationBucket = chosenBucket ?? bucket;
  const folder = typedFolder ?? prefix;
  const name = typedName ?? (single ? lastPathSegment(single.key) : "");

  const entries = useMemo<MoveEntry[]>(
    () =>
      targets.map((object) => ({
        key: object.key,
        destinationKey: joinObjectPath(
          folder,
          single ? name : lastPathSegment(object.key),
        ),
      })),
    [targets, folder, single, name],
  );

  const destinationsValid = entries.every(
    (entry) =>
      entry.destinationKey.length > 0 && !entry.destinationKey.endsWith("/"),
  );
  const relocates = entries.some(
    (entry) =>
      destinationBucket !== bucket || entry.destinationKey !== entry.key,
  );
  const canMove =
    targets.length > 0 && destinationsValid && relocates && !moving;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      const response = await listBucketNamesAction();
      if (cancelled || !response.ok) {
        // A failed listing still leaves the current bucket selectable, so a
        // same-bucket move stays possible.
        return;
      }
      setBuckets(response.buckets);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      setBrowsing(true);
      const response = await loadObjectsAction({
        bucket: destinationBucket,
        prefix: joinObjectPath(folder, ""),
      });
      if (cancelled) {
        return;
      }
      setBrowsing(false);
      if (!response.ok) {
        setFolders([]);
        setBrowseError(response.message);
        return;
      }
      setFolders(response.page.prefixes);
      setBrowseError(undefined);
    };
    const timer = window.setTimeout(() => void load(), BROWSE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, destinationBucket, folder]);

  function reset(): void {
    setChosenBucket(undefined);
    setTypedFolder(undefined);
    setTypedName(undefined);
    setMoving(false);
    setError(undefined);
    setResult(undefined);
  }

  function close(): void {
    reset();
    onClose();
  }

  async function runMove(): Promise<void> {
    if (!canMove) {
      return;
    }
    setMoving(true);
    setError(undefined);
    const response = await moveObjectsAction({
      sourceBucket: bucket,
      destinationBucket,
      entries,
    });
    setMoving(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.result);
    onMoved(response.result, destinationBucket);
  }

  const parent = parentPrefix(folder.replace(/\/+$/, ""));

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? "Move result" : "Move objects"}
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={moving}>
              Cancel
            </Button>
            <Button onClick={runMove} disabled={!canMove}>
              {moving ? (
                <Spinner size="sm" />
              ) : (
                <Icon size="sm" asChild>
                  <FolderInput />
                </Icon>
              )}
              Move {targets.length}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Stack gap="3" fontSize="sm">
          <Text>
            Moved{" "}
            <Text as="span" fontWeight="medium">
              {result.moved.length}
            </Text>{" "}
            object{result.moved.length === 1 ? "" : "s"}.
          </Text>
          {result.failed.length > 0 ? (
            <Stack gap="2">
              <Alert variant="error">
                {result.failed.length} object
                {result.failed.length === 1 ? "" : "s"} could not be moved.
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
          <Box>
            <Text asChild color="fg.muted" fontSize="xs" mb="1">
              <label htmlFor="move-bucket">Destination bucket</label>
            </Text>
            <NativeSelect.Root>
              <NativeSelect.Field
                id="move-bucket"
                value={destinationBucket}
                onChange={(event) => {
                  setChosenBucket(event.currentTarget.value);
                  // A path is meaningful only inside the bucket it was browsed
                  // in, so switching buckets restarts at its root.
                  setTypedFolder("");
                }}
              >
                {buckets.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>

          <Box>
            <Text asChild color="fg.muted" fontSize="xs" mb="1">
              <label htmlFor="move-folder">Destination folder</label>
            </Text>
            <Input
              id="move-folder"
              value={folder}
              onChange={(event) => setTypedFolder(event.target.value)}
              placeholder="Bucket root"
              autoComplete="off"
              fontFamily="mono"
            />
          </Box>

          <Box borderWidth="1px" borderColor="border" borderRadius="l2">
            <HStack
              borderBottomWidth="1px"
              borderColor="border"
              px="2"
              py="1"
              gap="2"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTypedFolder(parent)}
                disabled={folder.length === 0}
                aria-label="Go to parent folder"
                title="Parent folder"
              >
                <Icon size="sm" asChild>
                  <CornerLeftUp />
                </Icon>
              </Button>
              <Span
                color="fg.muted"
                fontFamily="mono"
                fontSize="xs"
                truncate
                title={`${destinationBucket}/${folder}`}
              >
                {destinationBucket}/{folder}
              </Span>
              {browsing ? <Spinner size="sm" color="fg.muted" /> : null}
            </HStack>
            <Box maxH="40" overflowY="auto" p="1">
              {browseError ? (
                <Text color="fg.error" fontSize="xs" px="1" py="2">
                  {browseError}
                </Text>
              ) : folders.length === 0 ? (
                <Text color="fg.muted" fontSize="xs" px="1" py="2">
                  {browsing ? "Loading folders…" : "No subfolders here"}
                </Text>
              ) : (
                <Stack gap="0">
                  {folders.map((entry) => (
                    <Button
                      key={entry.prefix}
                      variant="ghost"
                      size="sm"
                      justifyContent="flex-start"
                      onClick={() => setTypedFolder(entry.prefix)}
                    >
                      <Icon size="sm" color="brand.solid" asChild>
                        <Folder />
                      </Icon>
                      <Span fontFamily="mono" truncate>
                        {entry.name}/
                      </Span>
                    </Button>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>

          {single ? (
            <Box>
              <Text asChild color="fg.muted" fontSize="xs" mb="1">
                <label htmlFor="move-name">Name</label>
              </Text>
              <Input
                id="move-name"
                value={name}
                onChange={(event) => setTypedName(event.target.value)}
                autoComplete="off"
                fontFamily="mono"
              />
            </Box>
          ) : null}

          <Box bg="bg.muted" borderRadius="l2" px="3" py="2">
            {single ? (
              <Stack gap="1" fontFamily="mono" fontSize="xs">
                <Span color="fg.muted" truncate title={single.key}>
                  {bucket}/{single.key}
                </Span>
                <Span truncate title={entries[0]?.destinationKey}>
                  → {destinationBucket}/{entries[0]?.destinationKey}
                </Span>
              </Stack>
            ) : (
              <Stack gap="1">
                <Text>
                  Moving{" "}
                  <Text as="span" fontWeight="medium">
                    {targets.length}
                  </Text>{" "}
                  objects to{" "}
                  <Text as="span" fontFamily="mono">
                    {destinationBucket}/{folder}
                  </Text>
                </Text>
                <List.Root
                  variant="plain"
                  maxH="24"
                  overflowY="auto"
                  fontFamily="mono"
                  fontSize="xs"
                  gap="1"
                >
                  {entries.slice(0, PREVIEW_LIMIT).map((entry) => (
                    <List.Item key={entry.key} color="fg.muted" truncate>
                      {lastPathSegment(entry.destinationKey)}
                    </List.Item>
                  ))}
                </List.Root>
              </Stack>
            )}
          </Box>

          {/* Existing objects are never overwritten, so the destination is worth
              stating before the user commits rather than only in the result. */}
          <Text color="fg.muted" fontSize="xs">
            An object already at the destination is left untouched and reported
            as a failure.
          </Text>

          {error ? <Alert variant="error">{error}</Alert> : null}
        </Stack>
      )}
    </Modal>
  );
}
