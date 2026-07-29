"use client";

import {
  Copy,
  ExternalLink,
  KeyRound,
  Link as LinkIcon,
  RefreshCw,
} from "lucide-react";
import {
  Box,
  CloseButton,
  Drawer,
  Grid,
  HStack,
  Icon,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { ObjectSummary } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { Spinner } from "@/components/ui/spinner";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { useDownloadLinks } from "./download_link_context";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text color="fg.muted" fontSize="xs">
        {label}
      </Text>
      <Text fontSize="sm" wordBreak="break-all">
        {value}
      </Text>
    </Box>
  );
}

/** Download section: link type, full URL, and copy/open/regenerate actions. */
function DownloadSection({ objectKey }: { objectKey: string }) {
  const { linkFor, copy, open, regenerate, expiry } = useDownloadLinks();
  const link = linkFor(objectKey);
  const isPresigned = link.mode === "presigned";
  const generatedAt =
    link.expiresAt !== undefined ? link.expiresAt - expiry * 1000 : undefined;

  return (
    <Stack borderTopWidth="1px" borderColor="border" pt="4" gap="2">
      <HStack gap="2">
        <Icon size="sm" color="brand.solid" asChild>
          {isPresigned ? <KeyRound /> : <LinkIcon />}
        </Icon>
        <Text fontSize="sm" fontWeight="medium">
          Download
        </Text>
        <Text color="fg.muted" fontSize="xs">
          {isPresigned ? "Presigned" : "Direct"}
        </Text>
      </HStack>

      {link.status === "loading" ? (
        <HStack color="fg.muted" fontSize="sm" gap="2">
          <Spinner size="sm" /> Generating link…
        </HStack>
      ) : link.status === "error" ? (
        <Text color="fg.error" fontSize="sm">
          {link.message ?? "Failed to prepare download link"}
        </Text>
      ) : link.status === "idle" ? (
        <Text color="fg.muted" fontSize="sm">
          No link yet. Copy, open, or generate one when you need it.
        </Text>
      ) : (
        <Text
          bg="bg.muted"
          borderRadius="l2"
          p="2"
          fontFamily="mono"
          fontSize="xs"
          wordBreak="break-all"
          title={link.url}
        >
          {link.url}
        </Text>
      )}

      {isPresigned && link.status === "ready" ? (
        <Grid templateColumns="repeat(2, 1fr)" gap="2" color="fg.muted">
          <Field
            label="Generated"
            value={formatDateTime(
              generatedAt !== undefined ? new Date(generatedAt) : undefined,
            )}
          />
          <Field
            label="Expires"
            value={formatDateTime(
              link.expiresAt ? new Date(link.expiresAt) : undefined,
            )}
          />
        </Grid>
      ) : null}

      <HStack wrap="wrap" gap="2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copy(objectKey)}
          disabled={link.status === "loading"}
        >
          <Icon size="sm" asChild>
            <Copy />
          </Icon>
          Copy Link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => open(objectKey)}
          disabled={link.status === "loading"}
        >
          <Icon size="sm" asChild>
            <ExternalLink />
          </Icon>
          Open Link
        </Button>
        {isPresigned ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerate(objectKey)}
            disabled={link.status === "loading"}
          >
            <Icon size="sm" asChild>
              <RefreshCw />
            </Icon>
            {link.status === "idle" ? "Generate" : "Regenerate"}
          </Button>
        ) : null}
      </HStack>

      {!isPresigned ? (
        <Text color="fg.muted" fontSize="xs">
          Direct links require the object to allow anonymous read access.
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * Right-hand drawer showing full metadata and download links for one object.
 *
 * The fractional width is kept from the pre-Chakra implementation and resolves
 * against the viewport, since the positioner is fixed to it.
 */
export function ObjectDetailDrawer({
  object,
  onClose,
}: {
  object: ObjectSummary | undefined;
  onClose: () => void;
}) {
  if (!object) {
    return null;
  }

  return (
    <Drawer.Root
      open
      onOpenChange={(event) => {
        if (!event.open) {
          onClose();
        }
      }}
      placement="end"
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content w={{ base: "50%", md: "33%" }} maxW="none">
            <Drawer.Header>
              <Drawer.Title>Object details</Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" aria-label="Close" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <Stack gap="4">
                <Field label="Name" value={object.name} />
                <Field label="Key" value={object.key} />
                <Field
                  label="Size"
                  value={`${formatSize(object.size)} (${object.size} bytes)`}
                />
                <Field
                  label="Last Modified"
                  value={formatDateTime(object.lastModified)}
                />
                {object.storageClass ? (
                  <Field label="Storage Class" value={object.storageClass} />
                ) : null}
                {object.etag ? (
                  <Field label="ETag" value={object.etag} />
                ) : null}
                <DownloadSection objectKey={object.key} />
              </Stack>
            </Drawer.Body>
            <Drawer.Footer>
              <CopyButton
                value={object.key}
                label="Copy key"
                variant="outline"
              />
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
