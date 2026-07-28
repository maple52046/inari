"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toDateInputValue } from "@/lib/date";

/** Normalized scan options emitted to the planner. */
export interface CleanupScanOptionsValue {
  minSizeBytes?: number;
  olderThanIso?: string;
  maxResults: number;
}

const SIZE_UNITS: Record<string, number> = {
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
};

/** Shared with the planner so both sides start from the same cap. */
export const DEFAULT_MAX_RESULTS = 30;

const DEFAULT_MIN_SIZE_UNIT = "GB";

const DEFAULT_OLDER_THAN_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const selectClass =
  "h-10 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function toBytes(value: string, unit: string): number | undefined {
  const parsed = Number(value);
  if (!value.trim() || Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed * (SIZE_UNITS[unit] ?? 1));
}

function defaultOlderThan(): string {
  return toDateInputValue(
    new Date(Date.now() - DEFAULT_OLDER_THAN_DAYS * MS_PER_DAY),
  );
}

/** Inputs for minimum size, older-than date, and max results. */
export function CleanupScanOptions({
  onChange,
}: {
  onChange: (value: CleanupScanOptionsValue) => void;
}) {
  const [minValue, setMinValue] = useState("");
  const [minUnit, setMinUnit] = useState(DEFAULT_MIN_SIZE_UNIT);
  const [olderThan, setOlderThan] = useState(defaultOlderThan);
  const [maxResults, setMaxResults] = useState(String(DEFAULT_MAX_RESULTS));

  useEffect(() => {
    const parsedMax = Number(maxResults);
    onChange({
      minSizeBytes: toBytes(minValue, minUnit),
      olderThanIso: olderThan ? new Date(olderThan).toISOString() : undefined,
      maxResults:
        Number.isFinite(parsedMax) && parsedMax > 0
          ? Math.floor(parsedMax)
          : DEFAULT_MAX_RESULTS,
    });
  }, [minValue, minUnit, olderThan, maxResults, onChange]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor="cleanup-min-size">Minimum file size</Label>
        <div className="flex items-center gap-1">
          <Input
            id="cleanup-min-size"
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            inputMode="decimal"
            placeholder="Any"
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
        </div>
      </div>
      <div>
        <Label htmlFor="cleanup-older-than">Older than date</Label>
        <Input
          id="cleanup-older-than"
          type="date"
          value={olderThan}
          onChange={(event) => setOlderThan(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="cleanup-max-results">Maximum results</Label>
        <Input
          id="cleanup-max-results"
          value={maxResults}
          onChange={(event) => setMaxResults(event.target.value)}
          inputMode="numeric"
          placeholder={String(DEFAULT_MAX_RESULTS)}
        />
      </div>
    </div>
  );
}
