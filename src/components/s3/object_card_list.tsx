"use client";

import Link from "next/link";
import { File, Folder, FolderInput, Trash2 } from "lucide-react";
import {
  Box,
  Checkbox,
  HStack,
  Icon,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import type { PrefixUsageEntry } from "@/application/scan_prefix_usage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { lastPathSegment } from "@/lib/object_path";
import { truncateMiddle } from "@/lib/truncate";
import { DownloadLinkActions } from "./download_link_actions";

function prefixHref(bucket: string, prefix: string): string {
  return `/buckets/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`;
}

interface ObjectCardListProps {
  bucket: string;
  prefixes: CommonPrefix[];
  objects: ObjectSummary[];
  selected: ReadonlySet<string>;
  /** Folder totals from a scan, keyed by full prefix; absent until one runs. */
  folderUsage?: Map<string, PrefixUsageEntry>;
  onToggle: (key: string) => void;
  onOpenDetail: (object: ObjectSummary) => void;
  onMoveOne: (object: ObjectSummary) => void;
  onDeleteOne: (object: ObjectSummary) => void;
}

/** Mobile card view of prefixes (folders) and objects. */
export function ObjectCardList({
  bucket,
  prefixes,
  objects,
  selected,
  folderUsage,
  onToggle,
  onOpenDetail,
  onMoveOne,
  onDeleteOne,
}: ObjectCardListProps) {
  return (
    <Stack gap="2">
      {prefixes.map((entry) => {
        const usage = folderUsage?.get(entry.prefix);
        return (
          <Link key={entry.prefix} href={prefixHref(bucket, entry.prefix)}>
            <Card _hover={{ borderColor: "brand.solid" }}>
              <HStack gap="2" p="3">
                <Icon size="md" color="brand.solid" asChild>
                  <Folder />
                </Icon>
                <Span fontWeight="medium" flex="1" truncate>
                  {entry.name}/
                </Span>
                {/* Only present once a scan has walked the folder; no listing
                    call reports an aggregate for a prefix. */}
                {usage ? (
                  <Span color="fg.muted" fontSize="xs" whiteSpace="nowrap">
                    {formatSize(usage.totalSize)}
                  </Span>
                ) : null}
              </HStack>
            </Card>
          </Link>
        );
      })}
      {objects.map((object) => (
        <Card key={object.key}>
          <Stack p="3" gap="2">
            <HStack align="flex-start" gap="2">
              <Checkbox.Root
                size="sm"
                mt="1"
                checked={selected.has(object.key)}
                onCheckedChange={() => onToggle(object.key)}
              >
                <Checkbox.HiddenInput aria-label={`Select ${object.name}`} />
                <Checkbox.Control />
              </Checkbox.Root>
              <Box asChild minW="0" flex="1" textAlign="left">
                <button
                  type="button"
                  onClick={() => onOpenDetail(object)}
                  title={object.key}
                >
                  <HStack gap="2">
                    <Icon size="sm" color="fg.muted" flexShrink="0" asChild>
                      <File />
                    </Icon>
                    <Span truncate fontFamily="mono" fontSize="sm">
                      {truncateMiddle(object.name, 36)}
                    </Span>
                  </HStack>
                  <Text color="fg.muted" fontSize="xs" mt="1">
                    {formatSize(object.size)} ·{" "}
                    {formatDateTime(object.lastModified)}
                  </Text>
                </button>
              </Box>
              <CopyButton
                value={lastPathSegment(object.key)}
                label=""
                size="icon"
                aria-label={`Copy filename of ${object.name}`}
                title="Copy filename"
              />
            </HStack>
            <Box borderTopWidth="1px" borderColor="border" pt="2">
              <DownloadLinkActions objectKey={object.key} />
            </Box>
            <HStack justify="flex-end" gap="1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMoveOne(object)}
                aria-label={`Move ${object.name}`}
              >
                <Icon size="sm" asChild>
                  <FolderInput />
                </Icon>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteOne(object)}
                aria-label={`Delete ${object.name}`}
              >
                <Icon size="sm" color="fg.error" asChild>
                  <Trash2 />
                </Icon>
              </Button>
            </HStack>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
