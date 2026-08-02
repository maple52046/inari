import { fetchCapacityAction } from "@/api/actions";
import type { CapacityViewDto } from "@/api/types";

/**
 * The browser's copy of the server-side capacity index.
 *
 * A module-level store rather than component state because more than one
 * component on a page shows the same figures, and a scan finishing has to reach
 * all of them. It also collapses their reads into one request instead of one
 * per component.
 *
 * There is no reset for a changed connection, and none is needed: connecting
 * and disconnecting both navigate with a full document load, so this module
 * cannot outlive the connection whose figures it holds.
 */

/** What the store currently knows. */
export interface CapacityState {
  /** The last successful read, absent until one completes. */
  view?: CapacityViewDto;
  /** Whether a read is in flight. */
  loading: boolean;
  /** Why the last read failed, if it did. */
  error?: string;
}

/**
 * How long to wait before re-reading figures that are stale or being scanned.
 *
 * Polling rather than a pushed stream: a scan lands seconds to minutes later,
 * and each poll is a memory lookup on the server rather than a walk of the
 * backend, so the simpler transport costs almost nothing. The response already
 * carries everything a push would, so switching later changes only how it
 * arrives.
 */
export const POLL_INTERVAL_MS = 5_000;

const EMPTY: CapacityState = { loading: false };

let state: CapacityState = EMPTY;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * The read currently in flight, so concurrent callers share one request.
 *
 * Without this, mounting two components that both want figures would issue two
 * identical requests, and every poll tick would multiply by the number of
 * components on screen.
 */
let inFlight: Promise<void> | undefined;

function publish(next: CapacityState): void {
  state = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * Whether there is any reason to read again.
 *
 * A store that has never been read does not poll: the first read belongs to
 * whoever wants the figures, and polling towards it would race that caller.
 */
function shouldPoll(state: CapacityState): boolean {
  if (state.error !== undefined) {
    return true;
  }
  return state.view !== undefined && (state.view.stale || state.view.scanning);
}

function cancelPoll(): void {
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

/**
 * Queues the next read, if there is any reason to take one.
 *
 * Polling stops the moment the figures settle or nothing is on screen, so an
 * idle tab makes no requests at all.
 */
function schedulePoll(): void {
  if (pollTimer !== undefined || listeners.size === 0 || !shouldPoll(state)) {
    return;
  }
  pollTimer = setTimeout(() => {
    pollTimer = undefined;
    // A background tab is not showing anyone these figures, so it waits for
    // its turn on screen rather than polling into the void.
    if (typeof document !== "undefined" && document.hidden) {
      schedulePoll();
      return;
    }
    void refreshCapacity();
  }, POLL_INTERVAL_MS);
}

/** Subscribes to changes, for `useSyncExternalStore`. */
export function subscribeToCapacity(onChange: () => void): () => void {
  listeners.add(onChange);
  schedulePoll();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      cancelPoll();
    }
  };
}

/**
 * Returns the current state.
 *
 * Referentially stable between changes, which is what stops
 * `useSyncExternalStore` from treating every read as an update.
 */
export function getCapacityState(): CapacityState {
  return state;
}

/** Re-reads the index across every visible bucket. */
export async function refreshCapacity(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }

  publish({ ...state, loading: true });
  inFlight = fetchCapacityAction()
    .then((result) => {
      if (result.ok) {
        publish({ view: result.view, loading: false });
      } else {
        // The previous view is kept rather than cleared: figures that are a
        // few minutes old are more use than a page that suddenly shows
        // nothing because one poll failed.
        publish({ ...state, loading: false, error: result.message });
      }
    })
    .finally(() => {
      inFlight = undefined;
      schedulePoll();
    });

  return inFlight;
}

/** Discards everything the store holds, so a test starts from a clean slate. */
export function resetCapacityForTest(): void {
  cancelPoll();
  inFlight = undefined;
  publish(EMPTY);
}
