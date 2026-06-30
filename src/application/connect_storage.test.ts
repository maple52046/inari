import { describe, expect, it, vi } from "vitest";
import { StorageError } from "@/domain/s3/errors";
import { connectStorage } from "./connect_storage";
import {
  createFakeStorage,
  FakeSessionStore,
  sampleConnection,
} from "@/test/fakes";

describe("connectStorage", () => {
  it("saves the connection after a successful test", async () => {
    const session = new FakeSessionStore();
    const testConnection = vi.fn().mockResolvedValue(undefined);
    const createStorage = () => createFakeStorage({ testConnection });

    await connectStorage({ createStorage, session }, sampleConnection);

    expect(testConnection).toHaveBeenCalledOnce();
    expect(session.saved).toEqual(sampleConnection);
  });

  it("does not save when the connection test fails", async () => {
    const session = new FakeSessionStore();
    const createStorage = () =>
      createFakeStorage({
        testConnection: async () => {
          throw new StorageError("invalid_credential");
        },
      });

    await expect(
      connectStorage({ createStorage, session }, sampleConnection),
    ).rejects.toBeInstanceOf(StorageError);
    expect(session.saved).toBeUndefined();
  });
});
