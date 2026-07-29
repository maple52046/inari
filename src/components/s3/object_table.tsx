"use client";

import Link from "next/link";
import { CircleQuestionMark, File, Folder, Trash2 } from "lucide-react";
import { Checkbox, HStack, Icon, Span, Table } from "@chakra-ui/react";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { lastPathSegment } from "@/lib/object_path";
import { truncateMiddle } from "@/lib/truncate";
import { DownloadLinkActions, OpenLinkButton } from "./download_link_actions";
import { useDownloadLinks } from "./download_link_context";

function prefixHref(bucket: string, prefix: string): string {
  return `/buckets/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`;
}

/** Precondition a direct link cannot satisfy on its own, surfaced on hover. */
const DIRECT_LINK_HINT =
  "Direct links require the object to allow anonymous read access.";

// Hoisted so every row shares one style object; building it per row would defeat
// Emotion's class caching on listings that can run to hundreds of rows.
const ROW_STYLES = {
  _hover: { bg: "bg.subtle" },
  _selected: { bg: "bg.muted" },
} as const;

interface ObjectTableProps {
  bucket: string;
  prefixes: CommonPrefix[];
  objects: ObjectSummary[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  showStorageClass: boolean;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpenDetail: (object: ObjectSummary) => void;
  onDeleteOne: (object: ObjectSummary) => void;
}

/** Desktop table view of prefixes (folders) and objects. */
export function ObjectTable({
  bucket,
  prefixes,
  objects,
  selected,
  allSelected,
  showStorageClass,
  onToggle,
  onToggleAll,
  onOpenDetail,
  onDeleteOne,
}: ObjectTableProps) {
  // Naming the active mode in the header tells the user what the row's URL
  // actually is, since direct and presigned links are not interchangeable.
  const { mode } = useDownloadLinks();
  const urlColumnLabel =
    mode === "presigned" ? "URL (Presigned)" : "URL (Direct)";
  // A folder row spans every column except the leading checkbox, so the span
  // has to follow the optional Storage Class column.
  const folderColSpan = showStorageClass ? 6 : 5;

  return (
    // No height cap: the listing expands in full and the page is what scrolls,
    // so the user never has to scroll inside a box to reach the last object.
    // The scroll area is kept only for horizontal overflow on narrow viewports.
    <Table.ScrollArea borderWidth="1px" borderColor="border" borderRadius="l3">
      <Table.Root size="sm" interactive>
        <Table.Header>
          <Table.Row bg="bg.muted">
            <Table.ColumnHeader width="10">
              <Checkbox.Root
                size="sm"
                checked={allSelected}
                onCheckedChange={(event) => onToggleAll(event.checked === true)}
              >
                <Checkbox.HiddenInput aria-label="Select all loaded objects" />
                <Checkbox.Control />
              </Checkbox.Root>
            </Table.ColumnHeader>
            <Table.ColumnHeader>Name</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Size</Table.ColumnHeader>
            <Table.ColumnHeader>Last Modified</Table.ColumnHeader>
            {showStorageClass ? (
              <Table.ColumnHeader>Storage Class</Table.ColumnHeader>
            ) : null}
            <Table.ColumnHeader>
              <HStack gap="1" display="inline-flex">
                {urlColumnLabel}
                {mode === "direct" ? (
                  <Span
                    role="img"
                    aria-label={DIRECT_LINK_HINT}
                    title={DIRECT_LINK_HINT}
                    cursor="help"
                  >
                    <Icon size="xs" asChild>
                      <CircleQuestionMark />
                    </Icon>
                  </Span>
                ) : null}
              </HStack>
            </Table.ColumnHeader>
            <Table.ColumnHeader width="32" textAlign="end">
              Actions
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {prefixes.map((entry) => (
            <Table.Row key={entry.prefix} {...ROW_STYLES}>
              <Table.Cell />
              <Table.Cell colSpan={folderColSpan}>
                <Link href={prefixHref(bucket, entry.prefix)}>
                  <HStack
                    gap="2"
                    fontWeight="medium"
                    _hover={{ color: "brand.fg" }}
                  >
                    <Icon size="sm" color="brand.solid" asChild>
                      <Folder />
                    </Icon>
                    {entry.name}/
                  </HStack>
                </Link>
              </Table.Cell>
            </Table.Row>
          ))}
          {objects.map((object) => {
            const isSelected = selected.has(object.key);
            return (
              <Table.Row
                key={object.key}
                data-selected={isSelected ? "" : undefined}
                {...ROW_STYLES}
              >
                <Table.Cell>
                  <Checkbox.Root
                    size="sm"
                    checked={isSelected}
                    onCheckedChange={() => onToggle(object.key)}
                  >
                    <Checkbox.HiddenInput
                      aria-label={`Select ${object.name}`}
                    />
                    <Checkbox.Control />
                  </Checkbox.Root>
                </Table.Cell>
                <Table.Cell>
                  {/* The copy control is a sibling, not a child, of the detail
                      button: nested buttons are invalid markup. */}
                  <HStack gap="1" minW="0">
                    <HStack
                      asChild
                      gap="2"
                      minW="0"
                      textAlign="left"
                      _hover={{ color: "brand.fg" }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDetail(object)}
                        title={object.key}
                      >
                        <Icon size="sm" color="fg.muted" flexShrink="0" asChild>
                          <File />
                        </Icon>
                        <Span fontFamily="mono">
                          {truncateMiddle(object.name, 52)}
                        </Span>
                      </button>
                    </HStack>
                    <CopyButton
                      value={lastPathSegment(object.key)}
                      label=""
                      size="icon"
                      aria-label={`Copy filename of ${object.name}`}
                      title="Copy filename"
                    />
                  </HStack>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  {formatSize(object.size)}
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">
                  {formatDateTime(object.lastModified)}
                </Table.Cell>
                {showStorageClass ? (
                  <Table.Cell color="fg.muted">
                    {object.storageClass ?? "—"}
                  </Table.Cell>
                ) : null}
                <Table.Cell maxW="16rem">
                  <DownloadLinkActions
                    objectKey={object.key}
                    showOpen={false}
                  />
                </Table.Cell>
                <Table.Cell>
                  <HStack gap="1" justify="flex-end">
                    <OpenLinkButton objectKey={object.key} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteOne(object)}
                      aria-label={`Delete ${object.name}`}
                      title="Delete"
                    >
                      <Icon size="sm" color="fg.error" asChild>
                        <Trash2 />
                      </Icon>
                    </Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
