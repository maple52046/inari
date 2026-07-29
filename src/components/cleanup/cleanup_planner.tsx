"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, Sparkles, Trash2 } from "lucide-react";
import { Flex, Grid, Icon, Span, Stack } from "@chakra-ui/react";
import type { CleanupCandidate, CleanupPlan } from "@/domain/s3/cleanup";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty_state";
import { formatSize } from "@/lib/format_size";
import { scanCleanupAction } from "@/app/(app)/cleanup/actions";
import { CleanupScopeSelector } from "./cleanup_scope_selector";
import {
  CleanupScanOptions,
  DEFAULT_MAX_RESULTS,
  type CleanupScanOptionsValue,
} from "./cleanup_scan_options";
import { CleanupCandidateTable } from "./cleanup_candidate_table";
import { CleanupSummaryPanel } from "./cleanup_summary_panel";
import { CleanupWarnings } from "./cleanup_warnings";
import { CleanupDeleteDialog } from "./cleanup_delete_dialog";

function candidateId(candidate: CleanupCandidate): string {
  return `${candidate.bucket}\u0000${candidate.key}`;
}

/** Client orchestrator for the Cleanup Planner. */
export function CleanupPlanner({ buckets }: { buckets: string[] }) {
  const [bucket, setBucket] = useState("");
  const [options, setOptions] = useState<CleanupScanOptionsValue>({
    maxResults: DEFAULT_MAX_RESULTS,
  });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | undefined>();
  const [plan, setPlan] = useState<CleanupPlan | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<CleanupCandidate[]>([]);

  const handleOptionsChange = useCallback((value: CleanupScanOptionsValue) => {
    setOptions(value);
  }, []);

  const candidates = useMemo(() => plan?.candidates ?? [], [plan]);

  const selectedCandidates = useMemo(
    () =>
      candidates.filter((candidate) => selected.has(candidateId(candidate))),
    [candidates, selected],
  );
  const selectedSize = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.sizeBytes,
    0,
  );
  const allSelected =
    candidates.length > 0 &&
    candidates.every((candidate) => selected.has(candidateId(candidate)));

  async function runScan(): Promise<void> {
    setScanning(true);
    setScanError(undefined);
    setSelected(new Set());
    const response = await scanCleanupAction({
      bucket: bucket || undefined,
      minSizeBytes: options.minSizeBytes,
      olderThanIso: options.olderThanIso,
      maxResults: options.maxResults,
    });
    setScanning(false);
    if (!response.ok) {
      setScanError(response.message);
      setPlan(undefined);
      return;
    }
    setPlan(response.plan);
  }

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelected(() => {
      if (!checked) {
        return new Set();
      }
      return new Set(candidates.map(candidateId));
    });
  }

  function openDeleteSelected(): void {
    setDeleteTargets(selectedCandidates);
    setDeleteOpen(true);
  }

  function openDeleteOne(candidate: CleanupCandidate): void {
    setDeleteTargets([candidate]);
    setDeleteOpen(true);
  }

  function onDeleted(deletedIds: string[]): void {
    const removed = new Set(deletedIds);
    setPlan((current) => {
      if (!current) {
        return current;
      }
      const remaining = current.candidates.filter(
        (candidate) => !removed.has(candidateId(candidate)),
      );
      return {
        ...current,
        candidates: remaining,
        summary: {
          ...current.summary,
          candidateCount: remaining.length,
          candidateTotalSize: remaining.reduce(
            (sum, candidate) => sum + candidate.sizeBytes,
            0,
          ),
        },
      };
    });
    setSelected((current) => {
      const next = new Set(current);
      for (const id of removed) {
        next.delete(id);
      }
      return next;
    });
  }

  return (
    <Stack gap="5">
      <Card>
        <Stack p="4" gap="4">
          <CleanupScopeSelector
            buckets={buckets}
            bucket={bucket}
            onBucketChange={setBucket}
            disabled={scanning}
          />
          <CleanupScanOptions onChange={handleOptionsChange} />
          <Button onClick={runScan} disabled={scanning} alignSelf="flex-start">
            {scanning ? (
              <Spinner size="sm" />
            ) : (
              <Icon size="sm" asChild>
                <Search />
              </Icon>
            )}
            Scan for cleanup candidates
          </Button>
        </Stack>
      </Card>

      {scanError ? <Alert variant="error">{scanError}</Alert> : null}
      {plan ? <CleanupWarnings warnings={plan.warnings} /> : null}

      <Grid templateColumns={{ base: "1fr", lg: "1fr 18rem" }} gap="5">
        <Stack gap="3">
          {selected.size > 0 ? (
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
              <Span fontSize="sm">
                {selected.size} selected · {formatSize(selectedSize)}
              </Span>
              <Button
                variant="destructive"
                size="sm"
                onClick={openDeleteSelected}
              >
                <Icon size="sm" asChild>
                  <Trash2 />
                </Icon>
                Delete selected
              </Button>
            </Flex>
          ) : null}

          {plan && candidates.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No cleanup candidates"
              description="No objects matched this scope and filters."
            />
          ) : null}

          {candidates.length > 0 ? (
            <CleanupCandidateTable
              candidates={candidates}
              selected={selected}
              allSelected={allSelected}
              idOf={candidateId}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onDeleteOne={openDeleteOne}
            />
          ) : null}
        </Stack>

        <CleanupSummaryPanel
          summary={plan?.summary}
          selectedCount={selected.size}
          selectedSize={selectedSize}
        />
      </Grid>

      <CleanupDeleteDialog
        open={deleteOpen}
        targets={deleteTargets}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDeleted}
      />
    </Stack>
  );
}
