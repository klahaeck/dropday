import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  db: vi.fn(),
  collection: vi.fn(),
  createIndex: vi.fn(),
  findMigration: vi.fn(),
  recordMigration: vi.fn(),
  aggregate: vi.fn(),
  deleteMany: vi.fn(),
  updateBucket: vi.fn(),
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
      ...(collectionName === "schemaMigrations"
        ? {
            findOne: mocks.findMigration,
            updateOne: mocks.recordMigration,
          }
        : {
            createIndex: (keys: object, options?: object) =>
              mocks.createIndex(collectionName, keys, options),
            aggregate: (...args: unknown[]) => mocks.aggregate(collectionName, ...args),
            deleteMany: (...args: unknown[]) => mocks.deleteMany(collectionName, ...args),
            updateOne: (...args: unknown[]) => mocks.updateBucket(collectionName, ...args),
          }),
    }));
    mocks.createIndex.mockResolvedValue("index-name");
    mocks.findMigration.mockResolvedValue(null);
    mocks.recordMigration.mockResolvedValue({ upsertedCount: 1 });
    mocks.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    mocks.deleteMany.mockResolvedValue({ deletedCount: 1 });
    mocks.updateBucket.mockResolvedValue({ modifiedCount: 1 });
  });

  it("keeps versioned index migrations out of the request connection path", async () => {
    const [database, client] = await Promise.all([getDb(), getMongoClient()]);

    expect(database).toBe(mocks.db.mock.results[0]?.value);
    expect(client).toEqual({ connect: mocks.connect, db: mocks.db });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.createIndex).not.toHaveBeenCalled();

    await Promise.all([ensureIndexes(), ensureIndexes()]);

    expect(mocks.createIndex).toHaveBeenCalledTimes(45);
    expect(mocks.recordMigration).toHaveBeenCalledTimes(4);
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
      { key: 1 },
      { unique: true, name: "unique_rate_limit_bucket" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "rateLimits",
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "outbox",
      { status: 1, availableAt: 1, createdAt: 1 },
      { name: "retryable_pending_outbox_work" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "outbox",
      { status: 1, leaseUntil: 1, createdAt: 1 },
      { name: "expired_outbox_work_leases" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "outboxPushDeliveries",
      { eventId: 1, userId: 1, subscriptionId: 1 },
      { unique: true, name: "one_outbox_push_delivery_per_subscription" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "messages",
      { threadType: 1, threadId: 1, createdAt: -1, id: -1 },
      { name: "message_thread_cursor" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "clubInvitationSessions",
      { id: 1 },
      { unique: true, name: "unique_club_invitation_session_id" },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "clubInvitationSessions",
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "expire_club_invitation_sessions" },
    );
  });

  it("retries a rejected Mongo connection instead of caching the failure", async () => {
    const client = { connect: mocks.connect, db: mocks.db };
    mocks.connect
      .mockRejectedValueOnce(new Error("connection failed"))
      .mockResolvedValueOnce(client);

    await expect(getDb()).rejects.toThrow("connection failed");
    await expect(getDb()).resolves.toEqual({ collection: mocks.collection });

    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it("retries provisioning after an index creation failure", async () => {
    mocks.createIndex.mockRejectedValueOnce(new Error("index creation failed"));

    await expect(ensureIndexes()).rejects.toThrow("index creation failed");
    mocks.createIndex.mockResolvedValue("index-name");
    await expect(ensureIndexes()).resolves.toBeUndefined();

    expect(mocks.recordMigration).toHaveBeenCalledTimes(4);
  });

  it("stops with a clear error when existing logical IDs are duplicated", async () => {
    mocks.aggregate.mockImplementation((collectionName: string) => ({
      toArray: vi.fn().mockResolvedValue(
        collectionName === "users" ? [{ _id: "user-duplicate", count: 2 }] : [],
      ),
    }));

    await expect(ensureIndexes()).rejects.toThrow(
      "Cannot create unique users.id index; duplicate values exist: user-duplicate",
    );
    expect(mocks.createIndex).not.toHaveBeenCalled();
  });

  it("deduplicates ephemeral rate-limit buckets before adding uniqueness", async () => {
    mocks.aggregate.mockImplementation((collectionName: string) => ({
      toArray: vi.fn().mockResolvedValue(
        collectionName === "rateLimits"
          ? [{
              _id: "chat:user-1:10",
              documentIds: ["keep", "duplicate"],
              documentCount: 2,
              totalCount: 4,
              expiresAt: new Date("2026-09-17T19:00:00.000Z"),
            }]
          : [],
      ),
    }));

    await ensureIndexes();

    expect(mocks.updateBucket).toHaveBeenCalledWith(
      "rateLimits",
      { _id: "keep" },
      {
        $set: {
          key: "chat:user-1:10",
          count: 4,
          expiresAt: new Date("2026-09-17T19:00:00.000Z"),
        },
      },
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith(
      "rateLimits",
      { _id: { $in: ["duplicate"] } },
    );
    expect(mocks.createIndex).toHaveBeenCalledWith(
      "rateLimits",
      { key: 1 },
      { unique: true, name: "unique_rate_limit_bucket" },
    );
  });

  it.each([
    {
      collection: "outboxPushDeliveries",
      duplicate: { eventId: "event-1", userId: "user-1", subscriptionId: "subscription-1" },
      message: "Cannot create unique outbox push delivery destination index; duplicate keys exist",
    },
    {
      collection: "clubInvitationSessions",
      duplicate: "invitation-session-1",
      message: "Cannot create unique clubInvitationSessions.id index; duplicate values exist",
    },
  ])("preflights existing $collection uniqueness before its new index", async ({
    collection,
    duplicate,
    message,
  }) => {
    mocks.aggregate.mockImplementation((collectionName: string) => ({
      toArray: vi.fn().mockResolvedValue(
        collectionName === collection ? [{ _id: duplicate, count: 2 }] : [],
      ),
    }));

    await expect(ensureIndexes()).rejects.toThrow(message);
  });
});
