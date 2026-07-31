"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, FileQuestion, ScanLine } from "lucide-react";
import { Box, Flex, Icon, Span, Stack } from "@chakra-ui/react";
import type {
  CommonPrefix,
  DeleteResult,
  MoveResult,
  ObjectListPage,
  ObjectSummary,
} from "@/domain/s3/models";
import type { ObjectFilter, SortSpec } from "@/lib/object_filtering";
import { filterObjects, sortObjects } from "@/lib/object_filtering";
import type {
  DownloadMode,
  DownloadPreference,
  PresignExpiry,
} from "@/lib/download_preference";
import {
  DOWNLOAD_COOKIE,
  serializeDownloadPreference,
} from "@/lib/download_preference";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty_state";
import { ObjectBreadcrumbs } from "./object_breadcrumbs";
import { ObjectToolbar } from "./object_toolbar";
import { ObjectTable } from "./object_table";
import { ObjectCardList } from "./object_card_list";
import { ObjectDetailDrawer } from "./object_detail_drawer";
import { DeleteDialog } from "./delete_dialog";
import { MoveDialog } from "./move_dialog";
import { DownloadLinkProvider } from "./download_link_context";
import { childOfPrefix } from "@/lib/object_path";
import { getCookiePath } from "@/lib/base_path";
import type {
  PrefixUsage,
  PrefixUsageEntry,
} from "@/domain/s3/usage";
import {
  loadObjectsAction,
  scanPrefixUsageAction,
} from "@/api/actions";

/** What a measured folder size does and does not account for. */
const MEASURE_HINT =
  "Adds up the objects listed beneath each folder. Excludes provider-specific overhead, incomplete multipart uploads, object versions, delete markers, and backend internal metadata.";

function mergePrefixes(
  current: CommonPrefix[],
  incoming: CommonPrefix[],
): CommonPrefix[] {
  const seen = new Set(current.map((entry) => entry.prefix));
  const merged = [...current];
  for (const entry of incoming) {
    if (!seen.has(entry.prefix)) {
      seen.add(entry.prefix);
      merged.push(entry);
    }
  }
  return merged;
}

/** Full object browser: listing, pagination, filter/sort, selection, delete. */
export function ObjectBrowser({
  bucket,
  prefix,
  initialPage,
  endpoint,
  forcePathStyle,
  initialDownloadPreference,
  onRefresh,
}: {
  bucket: string;
  prefix: string;
  initialPage: ObjectListPage;
  endpoint: string;
  forcePathStyle: boolean;
  initialDownloadPreference: DownloadPreference;
  /** Refetches the current page, replacing the router refresh of the Next.js version. */
  onRefresh: () => void;
}) {

  const [objects, setObjects] = useState<ObjectSummary[]>(initialPage.objects);
  const [prefixes, setPrefixes] = useState<CommonPrefix[]>(
    initialPage.prefixes,
  );
  const [token, setToken] = useState<string | undefined>(
    initialPage.continuationToken,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();

  const [filter, setFilter] = useState<ObjectFilter>({});
  const [sort, setSort] = useState<SortSpec>({
    key: "name",
    direction: "asc",
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Storage class is rarely the reason someone opens the browser, so the column
  // starts hidden and the user opts in per visit.
  const [showStorageClass, setShowStorageClass] = useState(false);
  const [detail, setDetail] = useState<ObjectSummary | undefined>();
  const [deleteTargets, setDeleteTargets] = useState<ObjectSummary[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveTargets, setMoveTargets] = useState<ObjectSummary[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);

  const [usage, setUsage] = useState<PrefixUsage | undefined>();
  const [usageScanning, setUsageScanning] = useState(false);
  const [usageError, setUsageError] = useState<string | undefined>();

  const [downloadMode, setDownloadMode] = useState<DownloadMode>(
    initialDownloadPreference.mode,
  );
  const [expiry, setExpiry] = useState<PresignExpiry>(
    initialDownloadPreference.expiry,
  );

  const persistDownloadPreference = useCallback(
    (mode: DownloadMode, nextExpiry: PresignExpiry): void => {
      const maxAge = 60 * 60 * 24 * 365;
      const value = serializeDownloadPreference({ mode, expiry: nextExpiry });
      document.cookie = `${DOWNLOAD_COOKIE}=${value}; path=${getCookiePath()}; max-age=${maxAge}; samesite=lax`;
    },
    [],
  );

  function changeDownloadMode(mode: DownloadMode): void {
    setDownloadMode(mode);
    persistDownloadPreference(mode, expiry);
  }

  function changeExpiry(nextExpiry: PresignExpiry): void {
    setExpiry(nextExpiry);
    persistDownloadPreference(downloadMode, nextExpiry);
  }

  /*
   * Adopts a newly delivered server page.
   *
   * The listing renders from state, and `useState` only reads its initial value
   * on mount. The page keys this component by prefix, so navigating to another
   * folder remounts it, but a refresh keeps the same key: without this the
   * refetched page would be discarded and Refresh would appear to do nothing.
   */
  const [seededPage, setSeededPage] = useState(initialPage);
  if (seededPage !== initialPage) {
    setSeededPage(initialPage);
    setObjects(initialPage.objects);
    setPrefixes(initialPage.prefixes);
    setToken(initialPage.continuationToken);
    setLoadError(undefined);
    // Pages appended on top of the replaced listing are gone, so selections
    // pointing into them would keep inflating the count in the toolbar.
    setSelected((current) => {
      const present = new Set(initialPage.objects.map((object) => object.key));
      return new Set([...current].filter((key) => present.has(key)));
    });
  }

  const visible = useMemo(
    () => sortObjects(filterObjects(objects, filter), sort),
    [objects, filter, sort],
  );

  const selectedObjects = useMemo(
    () => objects.filter((object) => selected.has(object.key)),
    [objects, selected],
  );
  const selectedSize = selectedObjects.reduce(
    (sum, object) => sum + object.size,
    0,
  );
  const allSelected =
    visible.length > 0 && visible.every((object) => selected.has(object.key));

  const handleFilterChange = useCallback((next: ObjectFilter) => {
    setFilter(next);
  }, []);

  /**
   * Measures the current location. Only ever called from the panel's button,
   * because it walks every object beneath the prefix.
   */
  async function measureUsage(): Promise<void> {
    setUsageScanning(true);
    setUsageError(undefined);
    const result = await scanPrefixUsageAction({ bucket, prefix });
    setUsageScanning(false);
    if (!result.ok) {
      setUsage(undefined);
      setUsageError(result.message);
      return;
    }
    setUsage(result.usage);
  }

  // Keyed by full prefix so the listing's folder rows can look themselves up;
  // the scan reports names relative to the location it measured. Only folders
  // are taken, since the rows for objects already carry their own size.
  const folderUsage = useMemo(() => {
    const byPrefix = new Map<string, PrefixUsageEntry>();
    for (const entry of usage?.entries ?? []) {
      if (entry.isPrefix) {
        byPrefix.set(`${prefix}${entry.name}`, entry);
      }
    }
    return byPrefix;
  }, [usage, prefix]);

  async function loadMore(): Promise<void> {
    if (!token) {
      return;
    }
    setLoadingMore(true);
    setLoadError(undefined);
    const result = await loadObjectsAction({
      bucket,
      prefix,
      continuationToken: token,
    });
    setLoadingMore(false);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setObjects((current) => [...current, ...result.page.objects]);
    setPrefixes((current) => mergePrefixes(current, result.page.prefixes));
    setToken(result.page.continuationToken);
  }

  function toggle(key: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      for (const object of visible) {
        if (checked) {
          next.add(object.key);
        } else {
          next.delete(object.key);
        }
      }
      return next;
    });
  }

  function openDeleteSelected(): void {
    setDeleteTargets(selectedObjects);
    setDeleteOpen(true);
  }

  function openDeleteOne(object: ObjectSummary): void {
    setDeleteTargets([object]);
    setDeleteOpen(true);
  }

  function onDeleted(result: DeleteResult): void {
    const removed = new Set(result.deleted);
    setObjects((current) =>
      current.filter((object) => !removed.has(object.key)),
    );
    setSelected((current) => {
      const next = new Set(current);
      for (const key of removed) {
        next.delete(key);
      }
      return next;
    });
  }

  function openMoveSelected(): void {
    setMoveTargets(selectedObjects);
    setMoveOpen(true);
  }

  function openMoveOne(object: ObjectSummary): void {
    setMoveTargets([object]);
    setMoveOpen(true);
  }

  /**
   * Reconciles the listing with a completed move.
   *
   * A destination inside the current location still belongs on screen, so it is
   * re-added rather than left looking deleted: directly in this folder it stays
   * an object row, and deeper down it appears as the folder that now holds it,
   * which may not have existed before the move.
   */
  function onMoved(result: MoveResult, destinationBucket: string): void {
    const relocated = new Map(
      result.moved.map((entry) => [entry.key, entry.destinationKey]),
    );
    if (relocated.size === 0) {
      return;
    }

    const renamed: ObjectSummary[] = [];
    const arrivals: CommonPrefix[] = [];
    for (const object of objects) {
      const destinationKey = relocated.get(object.key);
      // Another bucket takes the object out of this listing entirely.
      if (destinationKey === undefined || destinationBucket !== bucket) {
        continue;
      }
      const child = childOfPrefix(destinationKey, prefix);
      if (!child) {
        continue;
      }
      if (child.isPrefix) {
        arrivals.push({
          prefix: `${prefix}${child.name}`,
          // Folder rows render their own trailing delimiter.
          name: child.name.slice(0, -1),
        });
      } else {
        // The ETag is dropped rather than carried over: a multipart copy
        // produces a different one, so the old value could be wrong.
        renamed.push({
          ...object,
          key: destinationKey,
          name: child.name,
          lastModified: new Date(),
          etag: undefined,
        });
      }
    }

    setObjects((current) => [
      ...current.filter((object) => !relocated.has(object.key)),
      ...renamed,
    ]);
    setPrefixes((current) => mergePrefixes(current, arrivals));
    setSelected((current) => {
      const next = new Set(current);
      for (const key of relocated.keys()) {
        next.delete(key);
      }
      return next;
    });
  }

  const isEmpty = visible.length === 0 && prefixes.length === 0;

  return (
    <DownloadLinkProvider
      mode={downloadMode}
      expiry={expiry}
      endpoint={endpoint}
      forcePathStyle={forcePathStyle}
      bucket={bucket}
    >
      <Stack gap="4">
        <ObjectBreadcrumbs bucket={bucket} prefix={prefix} />

        <ObjectToolbar
          sort={sort}
          onSortChange={setSort}
          onFilterChange={handleFilterChange}
          selectedCount={selected.size}
          selectedSize={selectedSize}
          onMove={openMoveSelected}
          onDelete={openDeleteSelected}
          onRefresh={onRefresh}
          showStorageClass={showStorageClass}
          onShowStorageClassChange={setShowStorageClass}
          downloadMode={downloadMode}
          onDownloadModeChange={changeDownloadMode}
          expiry={expiry}
          onExpiryChange={changeExpiry}
        />

        {isEmpty ? (
          <EmptyState
            icon={FileQuestion}
            title="No objects here"
            description="This prefix has no objects, or none match your filters."
          />
        ) : (
          <>
            {/* The caveat rides on the button rather than a standing paragraph,
                the way the table's URL column carries its own precondition. It
                still has to be stated somewhere: a scanned total is an estimate,
                not an authoritative figure. */}
            <Flex justify="flex-end">
              <Button
                variant="outline"
                size="sm"
                onClick={measureUsage}
                disabled={usageScanning}
                title={MEASURE_HINT}
              >
                {usageScanning ? (
                  <Spinner size="sm" />
                ) : (
                  <Icon size="sm" asChild>
                    <ScanLine />
                  </Icon>
                )}
                {usageScanning
                  ? "Measuring…"
                  : usage
                    ? "Re-measure folder sizes"
                    : "Measure folder sizes"}
              </Button>
            </Flex>
            <Box display={{ base: "none", md: "block" }}>
              <ObjectTable
                bucket={bucket}
                prefixes={prefixes}
                objects={visible}
                selected={selected}
                allSelected={allSelected}
                showStorageClass={showStorageClass}
                folderUsage={folderUsage}
                sort={sort}
                onSortChange={setSort}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onOpenDetail={setDetail}
                onMoveOne={openMoveOne}
                onDeleteOne={openDeleteOne}
              />
            </Box>
            <Box display={{ base: "block", md: "none" }}>
              <ObjectCardList
                bucket={bucket}
                prefixes={prefixes}
                objects={visible}
                selected={selected}
                folderUsage={folderUsage}
                onToggle={toggle}
                onOpenDetail={setDetail}
                onMoveOne={openMoveOne}
                onDeleteOne={openDeleteOne}
              />
            </Box>
          </>
        )}

        {loadError ? <Alert variant="error">{loadError}</Alert> : null}
        {usageError ? <Alert variant="error">{usageError}</Alert> : null}

        <Flex
          color="fg.muted"
          fontSize="sm"
          align="center"
          justify="space-between"
        >
          <Span>
            {visible.length} of {objects.length} loaded object
            {objects.length === 1 ? "" : "s"} shown
          </Span>
          {token ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Spinner size="sm" />
              ) : (
                <Icon size="sm" asChild>
                  <ChevronDown />
                </Icon>
              )}
              Load more
            </Button>
          ) : null}
        </Flex>

        {detail ? (
          <ObjectDetailDrawer
            object={detail}
            onClose={() => setDetail(undefined)}
          />
        ) : null}

        <DeleteDialog
          open={deleteOpen}
          bucket={bucket}
          targets={deleteTargets}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onDeleted}
        />

        <MoveDialog
          open={moveOpen}
          bucket={bucket}
          prefix={prefix}
          targets={moveTargets}
          onClose={() => setMoveOpen(false)}
          onMoved={onMoved}
        />
      </Stack>
    </DownloadLinkProvider>
  );
}
