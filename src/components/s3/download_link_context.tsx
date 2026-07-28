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
import { downloadUrlAction } from "@/app/(app)/buckets/[bucket]/actions";

/** Presigned URL state for a single object key. */
export interface PresignedState {
  status: "loading" | "ready" | "error";
  url?: string;
  expiresAt?: number;
  message?: string;
}

/**
 * Normalized link view for a single object, regardless of mode.
 *
 * `idle` means presigned mode with nothing signed yet; the URL is only produced
 * when the user asks for it. Direct links are always `ready`.
 */
export interface ObjectDownloadLink {
  mode: DownloadMode;
  url?: string;
  status: "idle" | "ready" | "loading" | "error";
  expiresAt?: number;
  message?: string;
}

interface DownloadLinkContextValue {
  mode: DownloadMode;
  expiry: PresignExpiry;
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
 * Presigned URLs are signed server-side only when a user asks for a specific
 * object, and cached in memory only (never persisted), so they are discarded on
 * navigation or disconnect.
 */
export function DownloadLinkProvider({
  mode,
  expiry,
  endpoint,
  forcePathStyle,
  bucket,
  children,
}: {
  mode: DownloadMode;
  expiry: PresignExpiry;
  endpoint: string;
  forcePathStyle: boolean;
  bucket: string;
  children: ReactNode;
}) {
  const { notify } = useToast();
  const [cache, setCache] = useState<Record<string, PresignedState>>({});
  // Expiry the current cache was signed with; a change invalidates the cache.
  const signedExpiryRef = useRef<PresignExpiry>(expiry);
  // Shared per-key requests, so a double click signs the object only once.
  const inFlightRef = useRef<Map<string, Promise<PresignedState>>>(new Map());

  const directUrlFor = useCallback(
    (key: string): string =>
      buildDirectUrl({ endpoint, forcePathStyle, bucket, key }),
    [endpoint, forcePathStyle, bucket],
  );

  // URLs signed with the previous expiry would hand out the wrong lifetime.
  useEffect(() => {
    if (signedExpiryRef.current === expiry) {
      return;
    }
    signedExpiryRef.current = expiry;
    inFlightRef.current.clear();
    setCache({});
  }, [expiry]);

  /** Signs one key unconditionally, reusing an in-flight request for it. */
  const sign = useCallback(
    (key: string): Promise<PresignedState> => {
      const pending = inFlightRef.current.get(key);
      if (pending) {
        return pending;
      }
      setCache((current) => ({ ...current, [key]: { status: "loading" } }));
      const request = (async (): Promise<PresignedState> => {
        let state: PresignedState;
        try {
          const result = await downloadUrlAction({
            bucket,
            key,
            expiresIn: expiry,
          });
          state = result.ok
            ? { status: "ready", url: result.url, expiresAt: result.expiresAt }
            : { status: "error", message: result.message };
        } catch {
          // A transport failure rejects instead of resolving to the action's
          // result type; keep it as link state so a click handler never leaves
          // an unhandled rejection.
          state = {
            status: "error",
            message: "Failed to prepare download link",
          };
        }
        inFlightRef.current.delete(key);
        setCache((current) => ({ ...current, [key]: state }));
        return state;
      })();
      inFlightRef.current.set(key, request);
      return request;
    },
    [bucket, expiry],
  );

  /** Returns a usable presigned URL for a key, signing it if needed. */
  const resolvePresignedUrl = useCallback(
    async (key: string): Promise<PresignedState> => {
      const existing = cache[key];
      if (isFresh(existing) && existing) {
        return existing;
      }
      return sign(key);
    },
    [cache, sign],
  );

  const regenerate = useCallback(
    async (key: string): Promise<void> => {
      await sign(key);
    },
    [sign],
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
        status: state?.status ?? "idle",
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
