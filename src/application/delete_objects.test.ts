import { describe, expect, it, vi } from "vitest";
import { deleteObjects } from "./delete_objects";
import { createFakeStorage } from "@/test/fakes";

describe("deleteObjects", () => {
  it("returns early without calling storage when no keys are given", async () => {
    const deleteSpy = vi.fn();
    const storage = createFakeStorage({ deleteObjects: deleteSpy });

    const result = await deleteObjects(storage, { bucket: "b", keys: [] });

    expect(result).toEqual({ deleted: [], failed: [] });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("delegates to the storage port for non-empty key sets", async () => {
    const storage = createFakeStorage({
      deleteObjects: async (_bucket, keys) => ({ deleted: keys, failed: [] }),
    });

    const result = await deleteObjects(storage, {
      bucket: "b",
      keys: ["a", "b"],
    });

    expect(result.deleted).toEqual(["a", "b"]);
  });
});
