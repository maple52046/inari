"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  ChevronDown,
  FolderInput,
  KeyRound,
  RefreshCw,
  ListFilter,
  ScanLine,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Box,
  Collapsible,
  Flex,
  HStack,
  Icon,
  InputGroup,
  Stack,
  Text,
  Wrap,
} from "@chakra-ui/react";
import type { ObjectFilter, SortKey, SortSpec } from "@/lib/object_filtering";
import type { DownloadMode, PresignExpiry } from "@/lib/download_preference";
import { EXPIRY_OPTIONS } from "@/lib/download_preference";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date_field";
import { Input } from "@/components/ui/input";
import { SelectField, toSelectOptions } from "@/components/ui/select_field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { FolderUsage } from "./use_folder_usage";
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

// The expiry is a number in the preference but a string on the wire of any
// select, so the conversion is kept in one place rather than at each end.
const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((option) => ({
  value: String(option.value),
  label: option.label,
}));

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
  /** Only what the control needs; the sizes themselves belong to the table. */
  folderSizes: Pick<
    FolderUsage,
    "measure" | "measuring" | "measured" | "automatic"
  >;
}

/** What a measured folder size does and does not account for. */
const MEASURE_HINT =
  "Adds up the objects listed beneath each folder. Excludes provider-specific overhead, incomplete multipart uploads, object versions, delete markers, and backend internal metadata.";

/** Key, size and date filters, sort controls, and batch-delete trigger. */
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
  folderSizes,
}: ObjectToolbarProps) {
  const [keyContains, setKeyContains] = useState("");
  const [minValue, setMinValue] = useState("");
  const [minUnit, setMinUnit] = useState("MB");
  const [maxValue, setMaxValue] = useState("");
  const [maxUnit, setMaxUnit] = useState("MB");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");

  useEffect(() => {
    onFilterChange({
      keyContains: keyContains || undefined,
      minSize: toBytes(minValue, minUnit),
      maxSize: toBytes(maxValue, maxUnit),
      before: parseDateInput(before),
      after: parseDateInput(after),
    });
  }, [
    keyContains,
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

  // Counted from the inputs rather than from the filter object, so it reflects
  // exactly what the user typed. Shown on the trigger because the controls are
  // collapsed by default: a narrowed listing with no visible cause reads as a
  // prefix that simply holds less than it does.
  const activeFilters = [
    keyContains.trim() !== "",
    toBytes(minValue, minUnit) !== undefined,
    toBytes(maxValue, maxUnit) !== undefined,
    parseDateInput(after) !== undefined,
    parseDateInput(before) !== undefined,
  ].filter(Boolean).length;

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
        <Collapsible.Root>
          <Collapsible.Trigger asChild>
            <Button
              variant="ghost"
              size="sm"
              width="full"
              justifyContent="start"
            >
              <Icon size="sm" color="fg.muted" asChild>
                <SlidersHorizontal />
              </Icon>
              Advanced
              {activeFilters > 0 ? (
                <Badge colorPalette="brand" size="sm">
                  {activeFilters} active
                </Badge>
              ) : null}
              <Collapsible.Indicator
                ml="auto"
                display="flex"
                transition="transform 0.15s"
                _open={{ transform: "rotate(180deg)" }}
              >
                <Icon size="sm" color="fg.muted" asChild>
                  <ChevronDown />
                </Icon>
              </Collapsible.Indicator>
            </Button>
          </Collapsible.Trigger>

          <Collapsible.Content>
            <Stack gap="3" pt="3">
              <Wrap align="center" gap="2">
                <InputGroup
                  flex="1"
                  minW="12rem"
                  startElement={
                    <Icon size="sm" color="fg.muted" asChild>
                      <ListFilter />
                    </Icon>
                  }
                >
                  {/* "Loaded" is the load-bearing word: listings are paginated, so
                this narrows what has been fetched and cannot reach a key that
                is still a page away. */}
                  <Input
                    value={keyContains}
                    onChange={(event) => setKeyContains(event.target.value)}
                    placeholder="Filter loaded objects"
                    aria-label="Filter loaded objects by key"
                  />
                </InputGroup>

                {/* Below md only: the table's own headers carry the sort control, but
              the card view that replaces the table there has no headers, so this
              is the only way to sort on a narrow screen. */}
                <HStack gap="1" display={{ base: "flex", md: "none" }}>
                  <SelectField
                    value={sort.key}
                    onChange={(key) =>
                      onSortChange({
                        key: key as SortKey,
                        direction: sort.direction,
                      })
                    }
                    options={SORT_OPTIONS}
                    label="Sort by"
                    width="10rem"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleDirection}
                    aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
                    title={
                      sort.direction === "asc" ? "Ascending" : "Descending"
                    }
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
                  <DateField
                    value={after}
                    onChange={setAfter}
                    label="Modified after"
                  />
                </FilterGroup>

                <FilterGroup label="Modified before">
                  <DateField
                    value={before}
                    onChange={setBefore}
                    label="Modified before"
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
                gap="2"
              >
                {/* The caveat rides on the button rather than a standing
                    paragraph, the way the table's URL column carries its own
                    precondition. It still has to be stated somewhere: a scanned
                    total is an estimate, not an authoritative figure. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderSizes.measure()}
                  disabled={folderSizes.measuring}
                  title={MEASURE_HINT}
                >
                  {folderSizes.measuring ? (
                    <Spinner size="sm" />
                  ) : (
                    <Icon size="sm" asChild>
                      <ScanLine />
                    </Icon>
                  )}
                  {folderSizes.measuring
                    ? "Measuring…"
                    : folderSizes.measured || folderSizes.automatic
                      ? "Re-measure folder sizes"
                      : "Measure folder sizes"}
                </Button>

                <Wrap ml="auto" align="center" gapX="4" gapY="2">
                  {/* Hidden below md: the column it controls only exists in the table
                view, and the card view never renders a storage class. */}
                  <HStack gap="2" display={{ base: "none", md: "flex" }}>
                    <Icon size="sm" color="fg.muted" asChild>
                      <Archive />
                    </Icon>
                    <Text asChild fontWeight="medium">
                      <label htmlFor="storage-class-switch">
                        Storage Class
                      </label>
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
                      <SelectField
                        id="expiry-select"
                        value={String(expiry)}
                        onChange={(value) =>
                          onExpiryChange(Number(value) as PresignExpiry)
                        }
                        options={EXPIRY_SELECT_OPTIONS}
                        // Named explicitly even though a visible label points
                        // here: the machine sets `aria-labelledby` at a label
                        // part we do not render, which would otherwise leave
                        // the accessible name resting on the trigger's content.
                        label="Expires in"
                        size="sm"
                        width="8rem"
                      />
                    </HStack>
                  ) : null}
                </Wrap>
              </Flex>
            </Stack>
          </Collapsible.Content>
        </Collapsible.Root>

        {/* Deliberately outside the collapsible. It only appears once something
            is selected, and it is the only route to moving or deleting that
            selection, so hiding it would leave a selection with nothing to act
            on and no sign of where the actions went. */}
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

const UNIT_OPTIONS = toSelectOptions(Object.keys(SIZE_UNITS));

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
    <SelectField
      value={value}
      onChange={onChange}
      options={UNIT_OPTIONS}
      label={label}
      width="5.5rem"
    />
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
