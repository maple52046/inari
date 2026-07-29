"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";

/**
 * Hoists Emotion's rules into the document head during streaming SSR.
 *
 * Without this, `ChakraProvider`'s two `<Global>` elements emit
 * `<style data-emotion="css-global ...">` inline in the React tree on the server
 * while rendering nothing on the client. The child lists then differ and React
 * discards the server HTML for that subtree and re-renders it, which also
 * surfaced as a null `parentNode` error. Chakra documents `next dev --webpack`
 * as the alternative fix; this keeps Turbopack instead.
 *
 * The cache key stays Emotion's default `css` so generated class names are
 * unchanged from before this provider existed.
 */
export function EmotionCacheProvider({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: "css" });
    // Tells Emotion not to warn about styles inserted outside a render pass,
    // which is exactly what the server-inserted-HTML flush does.
    cache.compat = true;

    // Only rules added since the previous flush may be emitted, otherwise every
    // flush in a streamed response would repeat all earlier rules.
    const previousInsert = cache.insert;
    let pending: string[] = [];
    cache.insert = (...args: Parameters<typeof previousInsert>) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        pending.push(serialized.name);
      }
      return previousInsert(...args);
    };
    const flush = (): string[] => {
      const flushed = pending;
      pending = [];
      return flushed;
    };

    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) {
      return null;
    }
    let styles = "";
    for (const name of names) {
      const rule = cache.inserted[name];
      // `inserted` holds `true` rather than a rule body for styles Emotion has
      // already committed to the sheet; those have nothing to emit here.
      if (typeof rule === "string") {
        styles += rule;
      }
    }
    return (
      <style
        data-emotion={`${cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
