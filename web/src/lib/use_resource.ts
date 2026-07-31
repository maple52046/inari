import { useCallback, useEffect, useState } from "react";

/** A resource being loaded from the API. */
export interface Resource<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  /** Re-runs the loader, replacing `router.refresh()` from the Next.js version. */
  reload: () => void;
}

/** What a completed load produced, tagged with the request it answered. */
interface Settled<T> {
  key: string;
  attempt: number;
  data?: T;
  error?: string;
}

/**
 * Loads data on mount and whenever `key` changes.
 *
 * Replaces what a Server Component used to do before rendering a page.
 *
 * `loading` is derived from whether the settled result still answers the
 * current request, rather than being set at the start of the effect: writing
 * state synchronously in an effect body triggers a second render pass on every
 * navigation. Tagging the result also discards a superseded response, so
 * quickly changing folders cannot leave an earlier, slower answer on screen.
 */
export function useResource<T>(
  key: string,
  load: () => Promise<T>,
  fallbackMessage: string,
): Resource<T> {
  const [settled, setSettled] = useState<Settled<T> | undefined>();
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let current = true;

    load()
      .then((data) => {
        if (current) {
          setSettled({ key, attempt, data });
        }
      })
      .catch((caught: unknown) => {
        if (current) {
          setSettled({
            key,
            attempt,
            error: caught instanceof Error ? caught.message : fallbackMessage,
          });
        }
      });

    return () => {
      current = false;
    };
    // `load` is rebuilt on every render by most callers, so the key and the
    // attempt counter are what actually identify the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const fresh = settled?.key === key && settled.attempt === attempt;

  return {
    data: fresh ? settled.data : undefined,
    error: fresh ? settled.error : undefined,
    loading: !fresh,
    reload,
  };
}
