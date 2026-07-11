"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { DownloadMode, PresignExpiry } from "@/lib/download_preference";
import { buildDirectUrl } from "@/lib/download_link";
import { copyText } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";
import {
  createPresignedUrlsAction,
  downloadUrlAction,
} from "@/app/(app)/buckets/[bucket]/actions";

/** Presigned URL state for a single object key. */
export interface PresignedState {
  status: "loading" | "ready" | "error";
  url?: string;
  expiresAt?: number;
  message?: string;
}

/** Normalized link view for a single object, regardless of mode. */
export interface ObjectDownloadLink {
  mode: DownloadMode;
  url?: string;
  status: "ready" | "loading" | "error";
  expiresAt?: number;
  message?: string;
}

interface DownloadLinkContextValue {
  mode: DownloadMode;
  expiry: PresignExpiry;
  /** Cap on how many visible keys are auto-presigned per page. */
  linkFor: (key: string) => ObjectDownloadLink;
  regenerate: (key: string) => Promise<void>;
  copy: (key: string) => Promise<void>;
  open: (key: string) => Promise<void>;
}

const DownloadLinkContext = createContext<DownloadLinkContextValue | undefined>(
  undefined,
);

/** Regenerate a presigned URL when it is within this window of expiry. */
const EXPIRY_SKEW_MS = 60_000;
/** Upper bound on visible objects auto-presigned at once. */
const MAX_AUTO_PRESIGN = 500;

function isFresh(state: PresignedState | undefined): boolean {
  return (
    state?.status === "ready" &&
    state.url !== undefined &&
    state.expiresAt !== undefined &&
    state.expiresAt - Date.now() > EXPIRY_SKEW_MS
  );
}

/**
 * Provides download links to the object browser subtree.
 *
 * Direct links are computed synchronously from the connection endpoint.
 * Presigned URLs are generated server-side for the currently visible keys and
 * cached in memory only (never persisted), so they are discarded on navigation
 * or disconnect.
 */
export function DownloadLinkProvider({
  mode,
  expiry,
  endpoint,
  forcePathStyle,
  bucket,
  visibleKeys,
  children,
}: {
  mode: DownloadMode;
  expiry: PresignExpiry;
  endpoint: string;
  forcePathStyle: boolean;
  bucket: string;
  visibleKeys: string[];
  children: ReactNode;
}) {
  const { notify } = useToast();
  const [cache, setCache] = useState<Record<string, PresignedState>>({});
  // Expiry the current cache was signed with; a change invalidates the cache.
  const signedExpiryRef = useRef<PresignExpiry>(expiry);
  const inFlightRef = useRef<Set<string>>(new Set());

  const directUrlFor = useCallback(
    (key: string): string =>
      buildDirectUrl({ endpoint, forcePathStyle, bucket, key }),
    [endpoint, forcePathStyle, bucket],
  );

  const generateBatch = useCallback(
    async (keys: string[]) => {
      const pending = keys.filter((key) => !inFlightRef.current.has(key));
      if (pending.length === 0) {
        return;
      }
      for (const key of pending) {
        inFlightRef.current.add(key);
      }
      setCache((current) => {
        const next = { ...current };
        for (const key of pending) {
          next[key] = { status: "loading" };
        }
        return next;
      });

      const entries = await createPresignedUrlsAction({
        bucket,
        keys: pending,
        expiresIn: expiry,
      });

      setCache((current) => {
        const next = { ...current };
        for (const entry of entries) {
          next[entry.key] = entry.ok
            ? { status: "ready", url: entry.url, expiresAt: entry.expiresAt }
            : { status: "error", message: entry.message };
        }
        return next;
      });
      for (const key of pending) {
        inFlightRef.current.delete(key);
      }
    },
    [bucket, expiry],
  );

  // Auto-presign the visible keys in presigned mode; reset when expiry changes.
  const visibleKey = visibleKeys.join("\u0000");
  useEffect(() => {
    if (mode !== "presigned") {
      return;
    }
    if (signedExpiryRef.current !== expiry) {
      signedExpiryRef.current = expiry;
      inFlightRef.current.clear();
      setCache({});
    }
    const keys = visibleKeys.slice(0, MAX_AUTO_PRESIGN);
    const missing = keys.filter((key) => {
      const state = cache[key];
      return !isFresh(state) && !inFlightRef.current.has(key);
    });
    if (missing.length > 0) {
      void generateBatch(missing);
    }
    // `cache` is intentionally omitted: it is updated by this effect and reading
    // it via closure for the freshness check is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expiry, visibleKey, generateBatch]);

  /** Returns a fresh presigned URL for a key, regenerating if needed. */
  const resolvePresignedUrl = useCallback(
    async (key: string): Promise<PresignedState> => {
      const existing = cache[key];
      if (isFresh(existing) && existing) {
        return existing;
      }
      const result = await downloadUrlAction({
        bucket,
        key,
        expiresIn: expiry,
      });
      const state: PresignedState = result.ok
        ? { status: "ready", url: result.url, expiresAt: result.expiresAt }
        : { status: "error", message: result.message };
      setCache((current) => ({ ...current, [key]: state }));
      return state;
    },
    [bucket, expiry, cache],
  );

  const regenerate = useCallback(
    async (key: string): Promise<void> => {
      setCache((current) => ({ ...current, [key]: { status: "loading" } }));
      const result = await downloadUrlAction({
        bucket,
        key,
        expiresIn: expiry,
      });
      setCache((current) => ({
        ...current,
        [key]: result.ok
          ? { status: "ready", url: result.url, expiresAt: result.expiresAt }
          : { status: "error", message: result.message },
      }));
    },
    [bucket, expiry],
  );

  const resolveUrl = useCallback(
    async (key: string): Promise<string | undefined> => {
      if (mode === "direct") {
        return directUrlFor(key);
      }
      const state = await resolvePresignedUrl(key);
      return state.url;
    },
    [mode, directUrlFor, resolvePresignedUrl],
  );

  const copy = useCallback(
    async (key: string): Promise<void> => {
      const url = await resolveUrl(key);
      if (!url) {
        notify("Failed to prepare download link", "error");
        return;
      }
      const copied = await copyText(url);
      notify(
        copied ? "Link copied" : "Copy failed",
        copied ? "success" : "error",
      );
    },
    [resolveUrl, notify],
  );

  const open = useCallback(
    async (key: string): Promise<void> => {
      const url = await resolveUrl(key);
      if (!url) {
        notify("Failed to prepare download link", "error");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [resolveUrl, notify],
  );

  const linkFor = useCallback(
    (key: string): ObjectDownloadLink => {
      if (mode === "direct") {
        return { mode, url: directUrlFor(key), status: "ready" };
      }
      const state = cache[key];
      return {
        mode,
        url: state?.url,
        status: state?.status ?? "loading",
        expiresAt: state?.expiresAt,
        message: state?.message,
      };
    },
    [mode, directUrlFor, cache],
  );

  const value = useMemo<DownloadLinkContextValue>(
    () => ({ mode, expiry, linkFor, regenerate, copy, open }),
    [mode, expiry, linkFor, regenerate, copy, open],
  );

  return (
    <DownloadLinkContext.Provider value={value}>
      {children}
    </DownloadLinkContext.Provider>
  );
}

/** Accesses the download-link API; throws outside the provider. */
export function useDownloadLinks(): DownloadLinkContextValue {
  const context = useContext(DownloadLinkContext);
  if (!context) {
    throw new Error(
      "useDownloadLinks must be used within DownloadLinkProvider",
    );
  }
  return context;
}
