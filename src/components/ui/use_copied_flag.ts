"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a successful copy stays acknowledged, in milliseconds. */
const ACKNOWLEDGEMENT_MS = 1500;

/**
 * Tracks the brief acknowledgement shown after a successful copy.
 *
 * Shared so every copy control acknowledges for the same duration rather than
 * each keeping its own timer and drifting.
 *
 * The pending timer is replaced on each call and cleared on unmount: clicking
 * twice extends the acknowledgement instead of the first timer cutting the second
 * one short, and a table row that unmounts mid-timer leaves nothing running.
 */
export function useCopiedFlag(): {
  copied: boolean;
  acknowledgeCopy: () => void;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  const acknowledgeCopy = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
    }
    setCopied(true);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = undefined;
    }, ACKNOWLEDGEMENT_MS);
  }, []);

  return { copied, acknowledgeCopy };
}
