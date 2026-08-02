/**
 * The API surface the components call.
 *
 * Every function here keeps the name and the result shape of the Next.js server
 * action it replaces, so the components that call them changed by import path
 * only. The discriminated `{ ok }` results are deliberate: they were already the
 * contract, and preserving them kept the migration mechanical.
 */

import type {
  DeleteResult,
  MoveResult,
  ObjectListPage,
  UsageScope,
} from "@/domain/s3/models";
import type {
  CleanupBucketDeleteResult,
  CleanupDeleteTarget,
  CleanupPlan,
} from "@/domain/s3/cleanup";
import type { PrefixUsage } from "@/domain/s3/usage";
import { ApiError, basePath, messageFor, request } from "./client";
import type { ConnectState } from "./connect_state";
import type { ConnectionDefaultsDto } from "./types";
import { reviveCleanupCandidate, reviveObjectListPage } from "./revive";
import type {
  BucketSummaryDto,
  CapacityScanAcceptedDto,
  CapacityViewDto,
  CleanupBucketDeleteResultDto,
  CleanupPlanDto,
  DeleteResultDto,
  MoveResultDto,
  ObjectListPageDto,
  PrefixUsageDto,
  PresignedUrlDto,
  SessionDto,
} from "./types";

/** Discriminated result returned to client components from list loading. */
export type LoadObjectsResult =
  { ok: true; page: ObjectListPage } | { ok: false; message: string };

/** Discriminated result returned from a batch delete. */
export type DeleteObjectsActionResult =
  { ok: true; result: DeleteResult } | { ok: false; message: string };

/** Discriminated result returned from a batch move. */
export type MoveObjectsActionResult =
  { ok: true; result: MoveResult } | { ok: false; message: string };

/** Discriminated result returned when listing move destinations. */
export type BucketNamesResult =
  { ok: true; buckets: string[] } | { ok: false; message: string };

/** Discriminated result returned when requesting a download URL. */
export type DownloadUrlResult =
  { ok: true; url: string; expiresAt: number } | { ok: false; message: string };

/** Discriminated result returned from measuring a location's contents. */
export type PrefixUsageResult =
  { ok: true; usage: PrefixUsage } | { ok: false; message: string };

/** Result of reading the server-side capacity index. */
export type CapacityViewResult =
  { ok: true; view: CapacityViewDto } | { ok: false; message: string };

/** Result of asking the server-side capacity index to refresh. */
export type CapacityScanResult =
  { ok: true; queued: number } | { ok: false; message: string };

/** Result of scanning a single bucket's usage. */
export type ScanBucketResult =
  | { ok: true; scope: UsageScope }
  | { ok: false; bucket: string; message: string };

/** Discriminated result of a cleanup scan. */
export type ScanCleanupResult =
  { ok: true; plan: CleanupPlan } | { ok: false; message: string };

/** Discriminated result of a cleanup deletion. */
export type DeleteCleanupResult =
  | { ok: true; results: CleanupBucketDeleteResult[] }
  | { ok: false; message: string };

/** Serializable input for a cleanup scan request. */
export interface ScanCleanupInput {
  bucket?: string;
  minSizeBytes?: number;
  /** ISO date string; objects modified before this are kept. */
  olderThanIso?: string;
  maxResults: number;
}

/** Default presigned lifetime in seconds, mirroring the server default. */
const DEFAULT_EXPIRES_IN = 3600;

/** Computes the absolute expiry (epoch ms) for a presigned URL. */
function expiresAtFrom(expiresIn: number | undefined): number {
  return Date.now() + (expiresIn ?? DEFAULT_EXPIRES_IN) * 1000;
}

function encodeBucket(bucket: string): string {
  return encodeURIComponent(bucket);
}

/** Reads the current session, which also drives the route guard. */
export async function getSession(): Promise<SessionDto> {
  return request<SessionDto>("/session");
}

/**
 * Reads a connection candidate from the submitted form.
 *
 * A locked deployment renders none of the target fields, and an absent
 * checkbox is indistinguishable from an unchecked one in `FormData`. Reading
 * them anyway would submit `false` for settings the operator pinned to `true`,
 * which the server correctly rejects — so the target is omitted entirely and
 * the server fills it in.
 */
function readConnectionForm(
  formData: FormData,
  connection: ConnectionDefaultsDto,
): Record<string, unknown> {
  const credentials = {
    accessKeyId: String(formData.get("accessKeyId") ?? ""),
    secretAccessKey: String(formData.get("secretAccessKey") ?? ""),
  };

  if (connection.locked) {
    return credentials;
  }

  return {
    ...credentials,
    endpoint: String(formData.get("endpoint") ?? ""),
    region: String(formData.get("region") ?? "") || undefined,
    forcePathStyle: formData.get("forcePathStyle") === "on",
    skipTlsVerification: formData.get("skipTlsVerification") === "on",
  };
}

/** Turns a failed request into the state the connection form renders. */
function toConnectState(error: unknown): ConnectState {
  if (error instanceof ApiError && error.fieldErrors) {
    return { status: "error", fieldErrors: error.fieldErrors };
  }
  return {
    status: "error",
    message: messageFor(error, "An unexpected error occurred"),
  };
}

/**
 * Validates and connects, then sends the browser to the bucket list.
 *
 * Navigating with a full document load is deliberate: the session lives in an
 * HttpOnly cookie that only the server can read, so reloading is what
 * guarantees the app starts from the connection that was just established
 * rather than from a stale client-side copy. It also mirrors what the Server
 * Action's `redirect` did.
 */
export async function connectAction(
  connection: ConnectionDefaultsDto,
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  try {
    await request<void>("/session", {
      method: "POST",
      body: readConnectionForm(formData, connection),
    });
  } catch (error) {
    return toConnectState(error);
  }
  window.location.assign(`${basePath()}/buckets`);
  return { status: "success" };
}

/** Validates the candidate connection without persisting it. */
export async function testConnectionAction(
  connection: ConnectionDefaultsDto,
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  try {
    await request<void>("/session/test", {
      method: "POST",
      body: readConnectionForm(formData, connection),
    });
  } catch (error) {
    return toConnectState(error);
  }
  return { status: "success", message: "Connection succeeded" };
}

/**
 * Drops the stored connection and returns to the connect screen.
 *
 * Navigates with a full document load for the same reason connecting does: the
 * session lives in a cookie only the server can read, so reloading is what
 * proves the app is no longer holding a connection. This is what the Server
 * Action's `redirect` used to do.
 */
export async function disconnectAction(): Promise<void> {
  try {
    await request<void>("/session", { method: "DELETE" });
  } finally {
    // Even a failed request should land the user on the connect screen: the
    // alternative is a settings page describing a session they asked to end.
    window.location.assign(`${basePath()}/connect`);
  }
}

/** Lists every bucket the session can see. */
export async function listBucketsAction(): Promise<BucketSummaryDto[]> {
  return request<BucketSummaryDto[]>("/buckets");
}

/** Loads one page of objects/prefixes for client-driven pagination. */
export async function loadObjectsAction(input: {
  bucket: string;
  prefix: string;
  continuationToken?: string;
}): Promise<LoadObjectsResult> {
  try {
    const page = await request<ObjectListPageDto>(
      `/buckets/${encodeBucket(input.bucket)}/objects`,
      {
        query: {
          prefix: input.prefix,
          continuationToken: input.continuationToken,
        },
      },
    );
    return { ok: true, page: reviveObjectListPage(page) };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to load next page"),
    };
  }
}

/** Deletes the selected keys and reports per-key outcome. */
export async function deleteObjectsAction(input: {
  bucket: string;
  keys: string[];
}): Promise<DeleteObjectsActionResult> {
  try {
    const result = await request<DeleteResultDto>(
      `/buckets/${encodeBucket(input.bucket)}/objects/delete`,
      { method: "POST", body: { keys: input.keys } },
    );
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Some objects could not be deleted"),
    };
  }
}

/**
 * Relocates the given objects and reports per-object outcome.
 *
 * Destination keys are resolved by the caller, which is what lets one request
 * serve both a rename and a batch move into a folder.
 */
export async function moveObjectsAction(input: {
  sourceBucket: string;
  destinationBucket: string;
  entries: { key: string; destinationKey: string }[];
}): Promise<MoveObjectsActionResult> {
  try {
    const result = await request<MoveResultDto>("/objects/move", {
      method: "POST",
      body: input,
    });
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Some objects could not be moved"),
    };
  }
}

/** Lists the buckets a move can target. */
export async function listBucketNamesAction(): Promise<BucketNamesResult> {
  try {
    const buckets = await listBucketsAction();
    return { ok: true, buckets: buckets.map((bucket) => bucket.name) };
  } catch (error) {
    return { ok: false, message: messageFor(error, "Failed to list buckets") };
  }
}

/**
 * Measures what the given location contains, one entry per immediate child.
 *
 * Walks every object beneath the prefix, so it is only ever invoked from an
 * explicit user action.
 */
export async function scanPrefixUsageAction(input: {
  bucket: string;
  prefix: string;
}): Promise<PrefixUsageResult> {
  try {
    const usage = await request<PrefixUsageDto>(
      `/buckets/${encodeBucket(input.bucket)}/prefix-usage`,
      { method: "POST", query: { prefix: input.prefix } },
    );
    return { ok: true, usage };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to measure this location"),
    };
  }
}

/** Returns a presigned URL the browser can use to download an object. */
export async function downloadUrlAction(input: {
  bucket: string;
  key: string;
  expiresIn?: number;
}): Promise<DownloadUrlResult> {
  try {
    const { url } = await request<PresignedUrlDto>(
      `/buckets/${encodeBucket(input.bucket)}/objects/presign`,
      { method: "POST", body: { key: input.key, expiresIn: input.expiresIn } },
    );
    return { ok: true, url, expiresAt: expiresAtFrom(input.expiresIn) };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to prepare download"),
    };
  }
}

/**
 * Scans one whole bucket and returns its aggregated usage.
 *
 * Scanning bucket-by-bucket from the client lets the UI report incremental
 * progress without a streaming transport.
 */
export async function scanBucketAction(
  bucket: string,
): Promise<ScanBucketResult> {
  try {
    const { scope } = await request<{ scope: UsageScope }>(
      `/buckets/${encodeBucket(bucket)}/usage`,
      { method: "POST" },
    );
    return { ok: true, scope };
  } catch (error) {
    return {
      ok: false,
      bucket,
      message: messageFor(error, "Failed to scan bucket"),
    };
  }
}

/**
 * Reads the server-side capacity index.
 *
 * Cheap and side-effect-light by design: the server answers from memory and
 * only queues a refresh behind the response, so a caller polling this while
 * figures are stale is not asking the backend to be walked again each time.
 *
 * Omit the bucket to read every bucket the session can see.
 */
export async function fetchCapacityAction(input?: {
  bucket?: string;
  prefix?: string;
}): Promise<CapacityViewResult> {
  try {
    const view = await request<CapacityViewDto>("/capacity", {
      query: { bucket: input?.bucket, prefix: input?.prefix },
    });
    return { ok: true, view };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to read stored usage"),
    };
  }
}

/**
 * Asks the server-side index to re-measure a location, or every visible bucket.
 *
 * Returns as soon as the work is queued rather than when it finishes, because
 * on a large backend a walk outlasts any sensible request. Callers watch the
 * figures change instead.
 */
export async function requestCapacityScanAction(input?: {
  bucket?: string;
  prefix?: string;
}): Promise<CapacityScanResult> {
  try {
    const { queued } = await request<CapacityScanAcceptedDto>(
      "/capacity/scan",
      {
        method: "POST",
        body: { bucket: input?.bucket, prefix: input?.prefix },
      },
    );
    return { ok: true, queued };
  } catch (error) {
    return { ok: false, message: messageFor(error, "Failed to start a scan") };
  }
}

/** Scans the requested scope and returns a ranked cleanup plan. */
export async function scanCleanupAction(
  input: ScanCleanupInput,
): Promise<ScanCleanupResult> {
  try {
    const dto = await request<CleanupPlanDto>("/cleanup/scan", {
      method: "POST",
      body: input,
    });
    return {
      ok: true,
      plan: {
        candidates: dto.candidates.map(reviveCleanupCandidate),
        summary: dto.summary,
        warnings: dto.warnings,
        scannedAt: dto.scannedAt ? new Date(dto.scannedAt) : new Date(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Failed to scan for cleanup"),
    };
  }
}

/** Deletes the selected candidates, grouped per bucket. */
export async function deleteCleanupAction(
  targets: CleanupDeleteTarget[],
): Promise<DeleteCleanupResult> {
  try {
    const results = await request<CleanupBucketDeleteResultDto[]>(
      "/cleanup/delete",
      { method: "POST", body: targets },
    );
    return { ok: true, results };
  } catch (error) {
    return {
      ok: false,
      message: messageFor(error, "Some objects could not be deleted"),
    };
  }
}

export { ApiError };
