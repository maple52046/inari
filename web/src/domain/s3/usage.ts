/**
 * Types describing a measured location.
 *
 * These lived in the application layer while the scan ran in-process. The scan
 * now runs on the server, so what remains on this side is the shape of the
 * answer.
 */

/** Usage of one immediate child of a scanned location. */
export interface PrefixUsageEntry {
  /** Name relative to the scanned prefix; folders keep their trailing delimiter. */
  name: string;
  /** Whether this aggregates a sub-tree rather than describing a single object. */
  isPrefix: boolean;
  totalSize: number;
  objectCount: number;
}

/** Breakdown of a single location by what it directly contains. */
export interface PrefixUsage {
  /** Human label for the location, e.g. `bucket/logs/`. */
  scope: string;
  /** Direct children, largest first. */
  entries: PrefixUsageEntry[];
  totalSize: number;
  objectCount: number;
  /**
   * Whether the server stopped recording new children.
   *
   * Only reachable for a location with an extraordinary number of direct
   * children; the totals stay accurate either way.
   */
  truncated: boolean;
}
