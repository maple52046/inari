"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  FolderInput,
  KeyRound,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  Box,
  Flex,
  HStack,
  Icon,
  InputGroup,
  NativeSelect,
  Stack,
  Text,
  Wrap,
} from "@chakra-ui/react";
import type { ObjectFilter, SortKey, SortSpec } from "@/lib/object_filtering";
import type { DownloadMode, PresignExpiry } from "@/lib/download_preference";
import { EXPIRY_OPTIONS } from "@/lib/download_preference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatSize } from "@/lib/format_size";
import { parseDateInput } from "@/lib/date";

const SIZE_UNITS: Record<string, number> = {
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
};

function toBytes(value: string, unit: string): number | undefined {
  const parsed = Number(value);
  if (!value.trim() || Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * (SIZE_UNITS[unit] ?? 1));
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
  { value: "lastModified", label: "Last Modified" },
];

interface ObjectToolbarProps {
  sort: SortSpec;
  onSortChange: (sort: SortSpec) => void;
  onFilterChange: (filter: ObjectFilter) => void;
  selectedCount: number;
  selectedSize: number;
  onMove: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  showStorageClass: boolean;
  onShowStorageClassChange: (show: boolean) => void;
  downloadMode: DownloadMode;
  onDownloadModeChange: (mode: DownloadMode) => void;
  expiry: PresignExpiry;
  onExpiryChange: (expiry: PresignExpiry) => void;
}

/** Search, size/date filters, sort controls, and batch-delete trigger. */
export function ObjectToolbar({
  sort,
  onSortChange,
  onFilterChange,
  selectedCount,
  selectedSize,
  onMove,
  onDelete,
  onRefresh,
  showStorageClass,
  onShowStorageClassChange,
  downloadMode,
  onDownloadModeChange,
  expiry,
  onExpiryChange,
}: ObjectToolbarProps) {
  const [search, setSearch] = useState("");
  const [minValue, setMinValue] = useState("");
  const [minUnit, setMinUnit] = useState("MB");
  const [maxValue, setMaxValue] = useState("");
  const [maxUnit, setMaxUnit] = useState("MB");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");

  useEffect(() => {
    onFilterChange({
      search: search || undefined,
      minSize: toBytes(minValue, minUnit),
      maxSize: toBytes(maxValue, maxUnit),
      before: parseDateInput(before),
      after: parseDateInput(after),
    });
  }, [
    search,
    minValue,
    minUnit,
    maxValue,
    maxUnit,
    before,
    after,
    onFilterChange,
  ]);

  function toggleDirection(): void {
    onSortChange({
      key: sort.key,
      direction: sort.direction === "asc" ? "desc" : "asc",
    });
  }

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      bg="bg.panel"
      borderRadius="l3"
      p="3"
      shadow="xs"
    >
      <Stack gap="3">
        <Wrap align="center" gap="2">
          <InputGroup
            flex="1"
            minW="12rem"
            startElement={
              <Icon size="sm" color="fg.muted" asChild>
                <Search />
              </Icon>
            }
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search loaded objects"
              aria-label="Search loaded objects"
            />
          </InputGroup>

          {/* Below md only: the table's own headers carry the sort control, but
              the card view that replaces the table there has no headers, so this
              is the only way to sort on a narrow screen. */}
          <HStack gap="1" display={{ base: "flex", md: "none" }}>
            <NativeSelect.Root width="auto">
              <NativeSelect.Field
                value={sort.key}
                onChange={(event) =>
                  onSortChange({
                    key: event.currentTarget.value as SortKey,
                    direction: sort.direction,
                  })
                }
                aria-label="Sort by"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleDirection}
              aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
              title={sort.direction === "asc" ? "Ascending" : "Descending"}
            >
              <Icon size="sm" asChild>
                <ArrowUpDown />
              </Icon>
            </Button>
          </HStack>

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            aria-label="Refresh"
            title="Refresh"
          >
            <Icon size="sm" asChild>
              <RefreshCw />
            </Icon>
          </Button>
        </Wrap>

        <Wrap align="flex-end" gap="3" fontSize="sm">
          <FilterGroup label="Min size">
            <Input
              value={minValue}
              onChange={(event) => setMinValue(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              width="20"
              aria-label="Minimum size"
            />
            <UnitSelect
              value={minUnit}
              onChange={setMinUnit}
              label="Minimum size unit"
            />
          </FilterGroup>

          <FilterGroup label="Max size">
            <Input
              value={maxValue}
              onChange={(event) => setMaxValue(event.target.value)}
              inputMode="decimal"
              placeholder="∞"
              width="20"
              aria-label="Maximum size"
            />
            <UnitSelect
              value={maxUnit}
              onChange={setMaxUnit}
              label="Maximum size unit"
            />
          </FilterGroup>

          <FilterGroup label="Modified after">
            <Input
              type="date"
              value={after}
              onChange={(event) => setAfter(event.target.value)}
              aria-label="Modified after"
            />
          </FilterGroup>

          <FilterGroup label="Modified before">
            <Input
              type="date"
              value={before}
              onChange={(event) => setBefore(event.target.value)}
              aria-label="Modified before"
            />
          </FilterGroup>
        </Wrap>

        <Flex
          borderTopWidth="1px"
          borderColor="border"
          pt="3"
          fontSize="sm"
          wrap="wrap"
          align="center"
        >
          <Wrap ml="auto" align="center" gapX="4" gapY="2">
            {/* Hidden below md: the column it controls only exists in the table
                view, and the card view never renders a storage class. */}
            <HStack gap="2" display={{ base: "none", md: "flex" }}>
              <Icon size="sm" color="fg.muted" asChild>
                <Archive />
              </Icon>
              <Text asChild fontWeight="medium">
                <label htmlFor="storage-class-switch">Storage Class</label>
              </Text>
              <Switch
                id="storage-class-switch"
                checked={showStorageClass}
                onCheckedChange={onShowStorageClassChange}
                aria-label="Show the Storage Class column"
              />
            </HStack>

            <HStack gap="2">
              <Icon size="sm" color="fg.muted" asChild>
                <KeyRound />
              </Icon>
              <Text asChild fontWeight="medium">
                <label htmlFor="presigned-switch">Presigned URL</label>
              </Text>
              <Switch
                id="presigned-switch"
                checked={downloadMode === "presigned"}
                onCheckedChange={(checked) =>
                  onDownloadModeChange(checked ? "presigned" : "direct")
                }
                aria-label="Use presigned download URLs"
              />
            </HStack>

            {/* Sits after the switch, so turning presigned on shifts the switch
                left by this group's width rather than leaving it in place. */}
            {downloadMode === "presigned" ? (
              <HStack gap="2">
                <Text asChild color="fg.muted" fontSize="xs">
                  <label htmlFor="expiry-select">Expires in</label>
                </Text>
                <NativeSelect.Root width="auto" size="sm">
                  <NativeSelect.Field
                    id="expiry-select"
                    value={expiry}
                    onChange={(event) =>
                      onExpiryChange(
                        Number(event.currentTarget.value) as PresignExpiry,
                      )
                    }
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </HStack>
            ) : null}
          </Wrap>
        </Flex>

        {selectedCount > 0 ? (
          <Flex
            bg="bg.muted"
            borderRadius="l2"
            px="3"
            py="2"
            wrap="wrap"
            align="center"
            justify="space-between"
            gap="2"
          >
            <Text fontSize="sm">
              {selectedCount} selected · {formatSize(selectedSize)}
            </Text>
            <HStack gap="2">
              <Button variant="outline" size="sm" onClick={onMove}>
                <Icon size="sm" asChild>
                  <FolderInput />
                </Icon>
                Move selected
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Icon size="sm" asChild>
                  <Trash2 />
                </Icon>
                Delete selected
              </Button>
            </HStack>
          </Flex>
        ) : null}
      </Stack>
    </Box>
  );
}

function UnitSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <NativeSelect.Root width="auto">
      <NativeSelect.Field
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={label}
      >
        {Object.keys(SIZE_UNITS).map((unit) => (
          <option key={unit}>{unit}</option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text color="fg.muted" fontSize="xs" mb="1">
        {label}
      </Text>
      <HStack gap="1">{children}</HStack>
    </Box>
  );
}
