import type { ObjectSummary } from "@/domain/s3/models";

/** Client-side filter applied over the currently loaded objects. */
export interface ObjectFilter {
  search?: string;
  /** Minimum size in bytes (inclusive). */
  minSize?: number;
  /** Maximum size in bytes (inclusive). */
  maxSize?: number;
  /** Keep objects modified strictly before this instant. */
  before?: Date;
  /** Keep objects modified strictly after this instant. */
  after?: Date;
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
  const search = filter.search?.trim().toLowerCase();
  return objects.filter((object) => {
    if (search && !object.key.toLowerCase().includes(search)) {
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
