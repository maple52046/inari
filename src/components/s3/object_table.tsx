"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  File,
  Folder,
  Trash2,
} from "lucide-react";
import { Checkbox, HStack, Icon, Span, Table } from "@chakra-ui/react";
import type { TableColumnHeaderProps } from "@chakra-ui/react";
import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";
import type { PrefixUsageEntry } from "@/application/scan_prefix_usage";
import type { SortDirection, SortKey, SortSpec } from "@/lib/object_filtering";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { lastPathSegment } from "@/lib/object_path";
import { truncateMiddle } from "@/lib/truncate";
import { CopyLinkButton, OpenLinkButton } from "./download_link_actions";

function prefixHref(bucket: string, prefix: string): string {
  return `/buckets/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(prefix)}`;
}

/**
 * Direction a column starts in when it first becomes the sort key.
 *
 * Names read naturally A to Z, while the interesting end of a size or a date is
 * the large or recent one, so those open descending.
 */
const INITIAL_DIRECTION: Record<SortKey, SortDirection> = {
  name: "asc",
  size: "desc",
  lastModified: "desc",
};

/** Column header that also acts as the sort control for its column. */
function SortableHeader({
  column,
  label,
  sort,
  onSortChange,
  // Not named `align`: that collides with the native `<th>` attribute in
  // TableColumnHeaderProps, and the intersection narrows it to never.
  alignment = "start",
  ...columnProps
}: {
  column: SortKey;
  label: string;
  sort: SortSpec;
  onSortChange: (sort: SortSpec) => void;
  alignment?: "start" | "end";
} & TableColumnHeaderProps) {
  const active = sort.key === column;
  const next: SortSpec = active
    ? { key: column, direction: sort.direction === "asc" ? "desc" : "asc" }
    : { key: column, direction: INITIAL_DIRECTION[column] };

  return (
    <Table.ColumnHeader
      textAlign={alignment}
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      {...columnProps}
    >
      <HStack
        asChild
        gap="1"
        display="inline-flex"
        justify={alignment === "end" ? "flex-end" : "flex-start"}
      >
        <button
          type="button"
          onClick={() => onSortChange(next)}
          title={`Sort by ${label}, ${next.direction === "asc" ? "ascending" : "descending"}`}
        >
          {label}
          <Icon size="xs" color={active ? "fg" : "fg.muted"} asChild>
            {active ? (
              sort.direction === "asc" ? (
                <ArrowUp />
              ) : (
                <ArrowDown />
              )
            ) : (
              <ChevronsUpDown />
            )}
          </Icon>
        </button>
      </HStack>
    </Table.ColumnHeader>
  );
}

/** Shown where a value exists but has not been measured yet. */
const NOT_MEASURED = "-";

/** Shown where a column has no meaning for the row, matching the object rows. */
const NOT_APPLICABLE = "—";

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
  /** Folder totals from a scan, keyed by full prefix; absent until one runs. */
  folderUsage?: Map<string, PrefixUsageEntry>;
  sort: SortSpec;
  onSortChange: (sort: SortSpec) => void;
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
  folderUsage,
  sort,
  onSortChange,
  onToggle,
  onToggleAll,
  onOpenDetail,
  onDeleteOne,
}: ObjectTableProps) {
  return (
    // No height cap: the listing expands in full and the page is what scrolls,
    // so the user never has to scroll inside a box to reach the last object.
    // The scroll area is kept only for horizontal overflow on narrow viewports.
    <Table.ScrollArea borderWidth="1px" borderColor="border" borderRadius="l3">
      <Table.Root size="sm" interactive>
        <Table.Header>
          <Table.Row bg="bg.muted">
            {/* Centred rather than start-aligned: the box is the cell's only
                content, and Chakra aligns a checkbox to the top of its line so a
                multi-line label lines up, which leaves it high in a bare cell. */}
            <Table.ColumnHeader width="12" textAlign="center">
              <Checkbox.Root
                size="sm"
                verticalAlign="middle"
                checked={allSelected}
                onCheckedChange={(event) => onToggleAll(event.checked === true)}
              >
                <Checkbox.HiddenInput aria-label="Select all loaded objects" />
                <Checkbox.Control />
              </Checkbox.Root>
            </Table.ColumnHeader>
            <SortableHeader
              column="name"
              label="Name"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              column="size"
              label="Size"
              alignment="end"
              sort={sort}
              onSortChange={onSortChange}
            />
            <SortableHeader
              column="lastModified"
              label="Last Modified"
              sort={sort}
              onSortChange={onSortChange}
            />
            {showStorageClass ? (
              <Table.ColumnHeader>Storage Class</Table.ColumnHeader>
            ) : null}
            <Table.ColumnHeader width="32">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {prefixes.map((entry) => {
            const usage = folderUsage?.get(entry.prefix);
            return (
              <Table.Row
                key={entry.prefix}
                {...ROW_STYLES}
                title={
                  usage
                    ? `${usage.objectCount.toLocaleString()} object${usage.objectCount === 1 ? "" : "s"}`
                    : undefined
                }
              >
                <Table.Cell />
                <Table.Cell>
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
                {/* A folder's size is only known once a scan has walked it, since
                    no listing call reports an aggregate for a prefix. */}
                <Table.Cell textAlign="end">
                  {usage ? formatSize(usage.totalSize) : NOT_MEASURED}
                </Table.Cell>
                <Table.Cell color="fg.muted">{NOT_APPLICABLE}</Table.Cell>
                {showStorageClass ? (
                  <Table.Cell color="fg.muted">{NOT_APPLICABLE}</Table.Cell>
                ) : null}
                <Table.Cell />
              </Table.Row>
            );
          })}
          {objects.map((object) => {
            const isSelected = selected.has(object.key);
            return (
              <Table.Row
                key={object.key}
                data-selected={isSelected ? "" : undefined}
                {...ROW_STYLES}
              >
                <Table.Cell textAlign="center">
                  <Checkbox.Root
                    size="sm"
                    verticalAlign="middle"
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
                <Table.Cell>
                  <HStack gap="1" justify="flex-end">
                    <CopyLinkButton objectKey={object.key} />
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
