"use client";

import { useEffect, useState } from "react";
import { ArrowUpDown, RefreshCw, Search, Trash2 } from "lucide-react";
import type { ObjectFilter, SortKey, SortSpec } from "@/lib/object_filtering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const selectClass =
  "h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

interface ObjectToolbarProps {
  sort: SortSpec;
  onSortChange: (sort: SortSpec) => void;
  onFilterChange: (filter: ObjectFilter) => void;
  selectedCount: number;
  selectedSize: number;
  onDelete: () => void;
  onRefresh: () => void;
}

/** Search, size/date filters, sort controls, and batch-delete trigger. */
export function ObjectToolbar({
  sort,
  onSortChange,
  onFilterChange,
  selectedCount,
  selectedSize,
  onDelete,
  onRefresh,
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
    <div className="border-border bg-card space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search loaded objects"
            className="pl-9"
            aria-label="Search loaded objects"
          />
        </div>

        <div className="flex items-center gap-1">
          <select
            value={sort.key}
            onChange={(event) =>
              onSortChange({
                key: event.target.value as SortKey,
                direction: sort.direction,
              })
            }
            className={selectClass}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDirection}
            aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
            title={sort.direction === "asc" ? "Ascending" : "Descending"}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <FilterGroup label="Min size">
          <Input
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-20"
            aria-label="Minimum size"
          />
          <select
            value={minUnit}
            onChange={(event) => setMinUnit(event.target.value)}
            className={selectClass}
            aria-label="Minimum size unit"
          >
            {Object.keys(SIZE_UNITS).map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Max size">
          <Input
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            inputMode="decimal"
            placeholder="∞"
            className="w-20"
            aria-label="Maximum size"
          />
          <select
            value={maxUnit}
            onChange={(event) => setMaxUnit(event.target.value)}
            className={selectClass}
            aria-label="Maximum size unit"
          >
            {Object.keys(SIZE_UNITS).map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
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
      </div>

      {selectedCount > 0 ? (
        <div className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2">
          <span className="text-sm">
            {selectedCount} selected · {formatSize(selectedSize)}
          </span>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete selected
          </Button>
        </div>
      ) : null}
    </div>
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
    <div>
      <p className="text-muted-foreground mb-1 text-xs">{label}</p>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
