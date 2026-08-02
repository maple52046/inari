import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapacityViewDto } from "@/api/types";

const fetchCapacityAction = vi.hoisted(() => vi.fn());
vi.mock("@/api/actions", () => ({ fetchCapacityAction }));

const {
  POLL_INTERVAL_MS,
  getCapacityState,
  refreshCapacity,
  resetCapacityForTest,
  subscribeToCapacity,
} = await import("./capacity_store");

function view(overrides: Partial<CapacityViewDto> = {}): CapacityViewDto {
  return {
    enabled: true,
    scope: "",
    totalSize: 100,
    objectCount: 2,
    measured: true,
    stale: false,
    subdivided: true,
    scanning: false,
    entries: [],
    ...overrides,
  };
}

/** Subscriptions to release afterwards, since the store outlives each test. */
let openSubscriptions: Array<() => void> = [];

function watch(onChange: () => void = () => {}): () => void {
  const unsubscribe = subscribeToCapacity(onChange);
  openSubscriptions.push(unsubscribe);
  return unsubscribe;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchCapacityAction.mockReset();
  resetCapacityForTest();
});

afterEach(() => {
  for (const unsubscribe of openSubscriptions) {
    unsubscribe();
  }
  openSubscriptions = [];
  resetCapacityForTest();
  vi.useRealTimers();
});

describe("capacity store", () => {
  it("publishes a successful read to subscribers", async () => {
    fetchCapacityAction.mockResolvedValue({ ok: true, view: view() });
    const notified = vi.fn();
    watch(notified);

    await refreshCapacity();

    expect(getCapacityState().view?.totalSize).toBe(100);
    expect(getCapacityState().loading).toBe(false);
    expect(notified).toHaveBeenCalled();
  });

  it("collapses concurrent reads into one request", async () => {
    fetchCapacityAction.mockResolvedValue({ ok: true, view: view() });

    await Promise.all([
      refreshCapacity(),
      refreshCapacity(),
      refreshCapacity(),
    ]);

    expect(fetchCapacityAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous figures when a read fails", async () => {
    fetchCapacityAction.mockResolvedValueOnce({ ok: true, view: view() });
    await refreshCapacity();

    fetchCapacityAction.mockResolvedValueOnce({ ok: false, message: "nope" });
    await refreshCapacity();

    // Figures a few minutes old beat a page that suddenly shows nothing.
    expect(getCapacityState().view?.totalSize).toBe(100);
    expect(getCapacityState().error).toBe("nope");
  });

  it("keeps re-reading while a scan is running", async () => {
    fetchCapacityAction.mockResolvedValue({
      ok: true,
      view: view({ scanning: true }),
    });
    watch();

    await refreshCapacity();
    expect(fetchCapacityAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(fetchCapacityAction).toHaveBeenCalledTimes(2);
  });

  it("keeps re-reading while the figures are stale", async () => {
    fetchCapacityAction.mockResolvedValue({
      ok: true,
      view: view({ stale: true }),
    });
    watch();

    await refreshCapacity();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(fetchCapacityAction).toHaveBeenCalledTimes(2);
  });

  it("stops re-reading once the figures settle", async () => {
    fetchCapacityAction.mockResolvedValue({ ok: true, view: view() });
    watch();

    await refreshCapacity();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 10);

    expect(fetchCapacityAction).toHaveBeenCalledTimes(1);
  });

  it("stops re-reading once nothing is on screen", async () => {
    fetchCapacityAction.mockResolvedValue({
      ok: true,
      view: view({ scanning: true }),
    });
    const unsubscribe = watch();

    await refreshCapacity();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 10);

    expect(fetchCapacityAction).toHaveBeenCalledTimes(1);
  });

  it("returns the same snapshot object until something changes", async () => {
    fetchCapacityAction.mockResolvedValue({ ok: true, view: view() });
    await refreshCapacity();

    // `useSyncExternalStore` treats a fresh object as a change, so an unchanged
    // read has to be referentially identical or every render loops.
    expect(getCapacityState()).toBe(getCapacityState());
  });
});
