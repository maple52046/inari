"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileQuestion, HardDrive } from "lucide-react";
import Link from "next/link";
import type {
  CommonPrefix,
  DeleteResult,
  ObjectListPage,
  ObjectSummary,
} from "@/domain/s3/models";
import type { ObjectFilter, SortSpec } from "@/lib/object_filtering";
import { filterObjects, sortObjects } from "@/lib/object_filtering";
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
import { loadObjectsAction } from "@/app/(app)/buckets/[bucket]/actions";

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
}: {
  bucket: string;
  prefix: string;
  initialPage: ObjectListPage;
}) {
  const router = useRouter();

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
  const [detail, setDetail] = useState<ObjectSummary | undefined>();
  const [deleteTargets, setDeleteTargets] = useState<ObjectSummary[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const isEmpty = visible.length === 0 && prefixes.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ObjectBreadcrumbs bucket={bucket} prefix={prefix} />
        <Link
          href={`/admin/usage?bucket=${encodeURIComponent(bucket)}`}
          className="border-border hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm"
        >
          <HardDrive className="h-4 w-4" />
          Scan usage
        </Link>
      </div>

      <ObjectToolbar
        sort={sort}
        onSortChange={setSort}
        onFilterChange={handleFilterChange}
        selectedCount={selected.size}
        selectedSize={selectedSize}
        onDelete={openDeleteSelected}
        onRefresh={() => router.refresh()}
      />

      {isEmpty ? (
        <EmptyState
          icon={FileQuestion}
          title="No objects here"
          description="This prefix has no objects, or none match your filters."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <ObjectTable
              bucket={bucket}
              prefixes={prefixes}
              objects={visible}
              selected={selected}
              allSelected={allSelected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpenDetail={setDetail}
              onDeleteOne={openDeleteOne}
            />
          </div>
          <div className="md:hidden">
            <ObjectCardList
              bucket={bucket}
              prefixes={prefixes}
              objects={visible}
              selected={selected}
              onToggle={toggle}
              onOpenDetail={setDetail}
              onDeleteOne={openDeleteOne}
            />
          </div>
        </>
      )}

      {loadError ? <Alert variant="error">{loadError}</Alert> : null}

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>
          {visible.length} of {objects.length} loaded object
          {objects.length === 1 ? "" : "s"} shown
        </span>
        {token ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <Spinner /> : <ChevronDown className="h-4 w-4" />}
            Load more
          </Button>
        ) : null}
      </div>

      {detail ? (
        <ObjectDetailDrawer
          bucket={bucket}
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
    </div>
  );
}
