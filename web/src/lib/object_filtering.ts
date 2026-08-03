import type { CommonPrefix, ObjectSummary } from "@/domain/s3/models";

/** Client-side filter applied over the currently loaded objects. */
export interface ObjectFilter {
  /**
   * Keep objects whose key contains this, case-insensitively.
   *
   * Named for what it does rather than "search", which would suggest asking the
   * backend a question. It matches the whole key, so a prefix segment matches
   * as readily as a filename.
   */
  keyContains?: string;
  /** Minimum size in bytes (inclusive). */
  minSize?: number;
  /** Maximum size in bytes (inclusive). */
  maxSize?: number;
  /** Keep objects modified strictly before this instant. */
  before?: Date;
  /** Keep objects modified strictly after this instant. */
  after?: Date;
}

/** Whether a predicate is set that describes an object rather than a name. */
function hasObjectOnlyPredicate(filter: ObjectFilter): boolean {
  return (
    filter.minSize !== undefined ||
    filter.maxSize !== undefined ||
    filter.before !== undefined ||
    filter.after !== undefined
  );
}

/**
 * Filters folder rows by what a listing can actually judge about them.
 *
 * Folders have to be filtered alongside objects, not left in place: a row that
 * survives a filter reads as a row that matched it, so an untouched folder
 * claims either that its path matched or that something inside it did. Neither
 * is true, and the listing gives no way to make it true.
 *
 * A folder has a path but no size and no modification time, so a predicate over
 * those cannot be evaluated against it at all. Rather than guess, folders step
 * aside while such a predicate is active.
 *
 * What this cannot do is see inside: only the folder's own path is examined, so
 * a hidden folder may still contain matches that are a listing away. That is
 * the same reach the object filter has, which stops at what is loaded.
 */
export function filterPrefixes(
  prefixes: readonly CommonPrefix[],
  filter: ObjectFilter,
): CommonPrefix[] {
  if (hasObjectOnlyPredicate(filter)) {
    return [];
  }
  const keyContains = filter.keyContains?.trim().toLowerCase();
  if (!keyContains) {
    return [...prefixes];
  }
  return prefixes.filter((prefix) =>
    prefix.prefix.toLowerCase().includes(keyContains),
  );
}

export type SortKey = "name" | "size" | "lastModified";
export type SortDirection = "asc" | "desc";

export interface SortSpec {
  key: SortKey;
  direction: SortDirection;
}

/**
 * Filters loaded objects in-memory.
 *
 * This operates only on objects already fetched; it is not a server-side query
 * and never implies the backend supports arbitrary predicates.
 */
export function filterObjects(
  objects: readonly ObjectSummary[],
  filter: ObjectFilter,
): ObjectSummary[] {
  const keyContains = filter.keyContains?.trim().toLowerCase();
  return objects.filter((object) => {
    if (keyContains && !object.key.toLowerCase().includes(keyContains)) {
      return false;
    }
    if (filter.minSize !== undefined && object.size < filter.minSize) {
      return false;
    }
    if (filter.maxSize !== undefined && object.size > filter.maxSize) {
      return false;
    }
    if (filter.before || filter.after) {
      const modified = object.lastModified?.getTime();
      if (modified === undefined) {
        return false;
      }
      if (filter.before && modified >= filter.before.getTime()) {
        return false;
      }
      if (filter.after && modified <= filter.after.getTime()) {
        return false;
      }
    }
    return true;
  });
}

/** Returns a new array sorted by the given spec; input is not mutated. */
export function sortObjects(
  objects: readonly ObjectSummary[],
  sort: SortSpec,
): ObjectSummary[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...objects].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return factor * a.name.localeCompare(b.name);
      case "size":
        return factor * (a.size - b.size);
      case "lastModified": {
        const left = a.lastModified?.getTime() ?? 0;
        const right = b.lastModified?.getTime() ?? 0;
        return factor * (left - right);
      }
    }
  });
}
