"use client";

import { Trash2 } from "lucide-react";
import { Checkbox, HStack, Icon, Table, Wrap } from "@chakra-ui/react";
import type { CleanupCandidate } from "@/domain/s3/cleanup";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy_button";
import { formatSize } from "@/lib/format_size";
import { formatDateTime } from "@/lib/date";
import { truncateMiddle } from "@/lib/truncate";
import { CleanupReasonBadge } from "./cleanup_reason_badge";

// Hoisted so every row shares one style object rather than rebuilding it per row.
const ROW_STYLES = {
  _hover: { bg: "bg.subtle" },
  _selected: { bg: "bg.muted" },
} as const;

interface CleanupCandidateTableProps {
  candidates: CleanupCandidate[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  idOf: (candidate: CleanupCandidate) => string;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDeleteOne: (candidate: CleanupCandidate) => void;
}

/** Ranked cleanup candidates with selection and per-row actions. */
export function CleanupCandidateTable({
  candidates,
  selected,
  allSelected,
  idOf,
  onToggle,
  onToggleAll,
  onDeleteOne,
}: CleanupCandidateTableProps) {
  return (
    // Matches the object listing: no height cap, so the page scrolls rather than
    // the table scrolling inside itself. The scroll area only handles horizontal
    // overflow.
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
                <Checkbox.HiddenInput aria-label="Select all candidates" />
                <Checkbox.Control />
              </Checkbox.Root>
            </Table.ColumnHeader>
            <Table.ColumnHeader>Bucket</Table.ColumnHeader>
            <Table.ColumnHeader>Key</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Size</Table.ColumnHeader>
            <Table.ColumnHeader>Last Modified</Table.ColumnHeader>
            <Table.ColumnHeader>Storage Class</Table.ColumnHeader>
            <Table.ColumnHeader>Cleanup Reason</Table.ColumnHeader>
            <Table.ColumnHeader width="24" textAlign="end">
              Actions
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {candidates.map((candidate) => {
            const id = idOf(candidate);
            const isSelected = selected.has(id);
            return (
              <Table.Row
                key={id}
                data-selected={isSelected ? "" : undefined}
                {...ROW_STYLES}
              >
                <Table.Cell>
                  <Checkbox.Root
                    size="sm"
                    checked={isSelected}
                    onCheckedChange={() => onToggle(id)}
                  >
                    <Checkbox.HiddenInput
                      aria-label={`Select ${candidate.key}`}
                    />
                    <Checkbox.Control />
                  </Checkbox.Root>
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">{candidate.bucket}</Table.Cell>
                <Table.Cell fontFamily="mono" title={candidate.key}>
                  {truncateMiddle(candidate.key, 48)}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  {formatSize(candidate.sizeBytes)}
                </Table.Cell>
                <Table.Cell whiteSpace="nowrap">
                  {formatDateTime(candidate.lastModified)}
                </Table.Cell>
                <Table.Cell color="fg.muted">
                  {candidate.storageClass ?? "—"}
                </Table.Cell>
                <Table.Cell>
                  <Wrap gap="1">
                    {candidate.reasons.map((reason) => (
                      <CleanupReasonBadge key={reason} reason={reason} />
                    ))}
                  </Wrap>
                </Table.Cell>
                <Table.Cell>
                  <HStack gap="1" justify="flex-end">
                    <CopyButton
                      value={candidate.key}
                      label=""
                      aria-label="Copy key"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteOne(candidate)}
                      aria-label={`Delete ${candidate.key}`}
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
