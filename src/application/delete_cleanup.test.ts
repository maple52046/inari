import { describe, expect, it, vi } from "vitest";
import { deleteCleanupCandidates } from "./delete_cleanup";
import { createFakeStorage } from "@/test/fakes";

describe("deleteCleanupCandidates", () => {
  it("groups targets by bucket and deletes each bucket once", async () => {
    const calls: { bucket: string; keys: string[] }[] = [];
    const storage = createFakeStorage({
      deleteObjects: async (bucket, keys) => {
        calls.push({ bucket, keys });
        return { deleted: keys, failed: [] };
      },
    });

    const results = await deleteCleanupCandidates(storage, [
      { bucket: "alpha", key: "1" },
      { bucket: "beta", key: "2" },
      { bucket: "alpha", key: "3" },
    ]);

    expect(calls).toHaveLength(2);
    const alpha = calls.find((c) => c.bucket === "alpha");
    expect(alpha?.keys).toEqual(["1", "3"]);
    expect(results).toEqual([
      { bucket: "alpha", deleted: ["1", "3"], failed: [] },
      { bucket: "beta", deleted: ["2"], failed: [] },
    ]);
  });

  it("propagates per-bucket failures", async () => {
    const storage = createFakeStorage({
      deleteObjects: async (bucket, keys) => ({
        deleted: [],
        failed: keys.map((key) => ({ key, message: "denied" })),
      }),
    });
    const results = await deleteCleanupCandidates(storage, [
      { bucket: "alpha", key: "1" },
    ]);
    expect(results[0]!.failed).toEqual([{ key: "1", message: "denied" }]);
  });

  it("returns nothing when there are no targets", async () => {
    const deleteObjects = vi.fn();
    const storage = createFakeStorage({ deleteObjects });
    const results = await deleteCleanupCandidates(storage, []);
    expect(results).toEqual([]);
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});
