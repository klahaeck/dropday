import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  db: vi.fn(),
  collection: vi.fn(),
  createIndex: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    mongoUri: "mongodb://dropday.test",
    mongoDb: "dropday",
  },
}));

vi.mock("mongodb", () => ({
  MongoClient: vi.fn(function MongoClientMock() {
    return {
      connect: mocks.connect,
      db: mocks.db,
    };
  }),
}));

import { ensureIndexes, getDb, getMongoClient } from "@/lib/db";

describe("MongoDB index provisioning", () => {
  beforeEach(() => {
    global.__dropdayMongoClientPromise = undefined;
    global.__dropdayIndexesPromise = undefined;

    vi.clearAllMocks();

    const database = { collection: mocks.collection };
    const client = { connect: mocks.connect, db: mocks.db };
    mocks.connect.mockResolvedValue(client);
    mocks.db.mockReturnValue(database);
    mocks.collection.mockImplementation((collectionName: string) => ({
      createIndex: (keys: object, options?: object) =>
        mocks.createIndex(collectionName, keys, options),
    }));
    mocks.createIndex.mockResolvedValue("index-name");
  });

  it("provisions every index once before sharing the Mongo connection", async () => {
    const [database, client] = await Promise.all([
      getDb(),
      getMongoClient(),
      ensureIndexes(),
    ]);

    expect(database).toBe(mocks.db.mock.results[0]?.value);
    expect(client).toEqual({ connect: mocks.connect, db: mocks.db });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.createIndex).toHaveBeenCalledTimes(19);
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "browserPushSubscriptions",
      { endpoint: 1 },
      { unique: true },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "outbox",
      { idempotencyKey: 1 },
      { unique: true },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "rateLimits",
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  });

  it("retries provisioning after an index creation failure", async () => {
    mocks.createIndex.mockRejectedValueOnce(new Error("index creation failed"));

    await expect(getDb()).rejects.toThrow("index creation failed");
    await expect(getDb()).resolves.toBe(mocks.db.mock.results[0]?.value);

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.createIndex).toHaveBeenCalledTimes(38);
  });
});
