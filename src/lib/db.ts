import { MongoClient, type Db, type ObjectId } from "mongodb";
import { env } from "./env.ts";

declare global {
  var __dropdayMongoClientPromise: Promise<MongoClient> | undefined;
  var __dropdayIndexesPromise: Promise<void> | undefined;
}

type IndexMigration = {
  id: string;
  run: (db: Db) => Promise<void>;
};

type DuplicateValue = { _id: unknown; count: number };

async function assertNoDuplicateValues(
  db: Db,
  checks: Array<{ collection: string; field: string }>,
): Promise<void> {
  for (const check of checks) {
    const duplicates = await db.collection(check.collection).aggregate<DuplicateValue>([
      { $group: { _id: `$${check.field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 5 },
    ]).toArray();
    if (!duplicates.length) continue;
    const values = duplicates.map((duplicate) => String(duplicate._id)).join(", ");
    throw new Error(
      `Cannot create unique ${check.collection}.${check.field} index; duplicate values exist: ${values}`,
    );
  }
}

async function assertNoDuplicateKeys(
  db: Db,
  checks: Array<{
    collection: string;
    fields: string[];
    match?: Record<string, unknown>;
    label?: string;
  }>,
): Promise<void> {
  for (const check of checks) {
    const groupId = Object.fromEntries(check.fields.map((field) => [field.replaceAll(".", "_"), `$${field}`]));
    const duplicates = await db.collection(check.collection).aggregate<DuplicateValue>([
      ...(check.match ? [{ $match: check.match }] : []),
      { $group: { _id: groupId, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 5 },
    ]).toArray();
    if (!duplicates.length) continue;
    const values = duplicates.map((duplicate) => JSON.stringify(duplicate._id)).join(", ");
    throw new Error(
      `Cannot create unique ${check.label ?? `${check.collection}.${check.fields.join("+")}`} index; duplicate keys exist: ${values}`,
    );
  }
}

async function deduplicateRateLimitBuckets(db: Db): Promise<void> {
  const duplicateBuckets = await db.collection("rateLimits").aggregate<{
    _id: string;
    documentIds: ObjectId[];
    documentCount: number;
    totalCount: number;
    expiresAt: Date;
  }>([
    {
      $group: {
        _id: "$key",
        documentIds: { $push: "$_id" },
        documentCount: { $sum: 1 },
        totalCount: { $sum: "$count" },
        expiresAt: { $max: "$expiresAt" },
      },
    },
    { $match: { documentCount: { $gt: 1 } } },
  ]).toArray();
  for (const bucket of duplicateBuckets) {
    await db.collection("rateLimits").updateOne(
      { _id: bucket.documentIds[0] },
      { $set: { key: bucket._id, count: bucket.totalCount, expiresAt: bucket.expiresAt } },
    );
    await db.collection("rateLimits").deleteMany({
      _id: { $in: bucket.documentIds.slice(1) },
    });
  }
}

async function getConnectedMongoClient(): Promise<MongoClient> {
  if (!env.mongoUri) throw new Error("MONGODB_URI is not configured");
  if (!global.__dropdayMongoClientPromise) {
    const client = new MongoClient(env.mongoUri, { appName: "dropday" });
    const connection = client.connect().catch((error) => {
      // A rejected promise must not poison every future request in this process.
      if (global.__dropdayMongoClientPromise === connection) {
        global.__dropdayMongoClientPromise = undefined;
      }
      throw error;
    });
    global.__dropdayMongoClientPromise = connection;
  }
  return global.__dropdayMongoClientPromise;
}

const indexMigrations: IndexMigration[] = [
  {
    id: "2026-09-17-core-logical-identifiers",
    run: async (db) => {
      await assertNoDuplicateValues(db, [
        { collection: "users", field: "id" },
        { collection: "clubs", field: "id" },
        { collection: "memberships", field: "id" },
        { collection: "joinRequests", field: "id" },
        { collection: "drops", field: "id" },
        { collection: "clubBackups", field: "id" },
        { collection: "playlistDrafts", field: "id" },
        { collection: "notifications", field: "id" },
        { collection: "outbox", field: "id" },
        { collection: "auditEvents", field: "id" },
      ]);
      await assertNoDuplicateKeys(db, [
        { collection: "users", fields: ["clerkUserId"] },
        {
          collection: "users",
          fields: ["generatedNameKey"],
          match: { generatedNameKey: { $type: "string" } },
        },
        { collection: "clubs", fields: ["slug"] },
        { collection: "memberships", fields: ["clubId", "userId"] },
        {
          collection: "joinRequests",
          fields: ["clubId", "userId"],
          match: { status: "pending" },
          label: "pending join request",
        },
        { collection: "drops", fields: ["clubId", "occurrenceKey"] },
        {
          collection: "clubBackups",
          fields: ["clubId", "playlist.sourceDraftId"],
          match: { status: "available" },
          label: "available club backup",
        },
        { collection: "browserPushSubscriptions", fields: ["endpoint"] },
        { collection: "outbox", fields: ["idempotencyKey"] },
        { collection: "webhookReceipts", fields: ["eventId"] },
      ]);
      await Promise.all([
        db.collection("users").createIndex({ id: 1 }, { unique: true, name: "unique_user_id" }),
        db.collection("users").createIndex({ clerkUserId: 1 }, { unique: true }),
        db.collection("users").createIndex(
          { generatedNameKey: 1 },
          {
            unique: true,
            partialFilterExpression: { generatedNameKey: { $type: "string" } },
            name: "unique_generated_user_name",
          },
        ),
        db.collection("clubs").createIndex({ id: 1 }, { unique: true, name: "unique_club_id" }),
        db.collection("clubs").createIndex({ slug: 1 }, { unique: true }),
        db.collection("clubs").createIndex({ visibility: 1, "custody.status": 1, updatedAt: -1 }),
        db.collection("memberships").createIndex({ id: 1 }, { unique: true, name: "unique_membership_id" }),
        db.collection("memberships").createIndex({ clubId: 1, userId: 1 }, { unique: true }),
        db.collection("memberships").createIndex({ userId: 1, status: 1 }),
        db.collection("memberships").createIndex({ userId: 1, role: 1, status: 1 }),
        db.collection("joinRequests").createIndex({ id: 1 }, { unique: true, name: "unique_join_request_id" }),
        db.collection("joinRequests").createIndex(
          { clubId: 1, userId: 1 },
          { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_join_request_per_user" },
        ),
        db.collection("joinRequests").createIndex({ clubId: 1, status: 1, createdAt: 1 }),
        db.collection("drops").createIndex({ id: 1 }, { unique: true, name: "unique_drop_id" }),
        db.collection("drops").createIndex({ clubId: 1, occurrenceKey: 1 }, { unique: true }),
        db.collection("drops").createIndex({ clubId: 1, status: 1, scheduledFor: -1 }),
        db.collection("clubBackups").createIndex({ id: 1 }, { unique: true, name: "unique_club_backup_id" }),
        db.collection("clubBackups").createIndex({ clubId: 1, status: 1, createdAt: -1 }),
        db.collection("clubBackups").createIndex(
          { clubId: 1, "playlist.sourceDraftId": 1 },
          {
            unique: true,
            partialFilterExpression: { status: "available" },
            name: "one_available_backup_per_playlist",
          },
        ),
        db.collection("playlistDrafts").createIndex({ id: 1 }, { unique: true, name: "unique_playlist_draft_id" }),
        db.collection("playlistDrafts").createIndex({ ownerId: 1, updatedAt: -1 }),
        db.collection("notifications").createIndex({ id: 1 }, { unique: true, name: "unique_notification_id" }),
        db.collection("notifications").createIndex({ userId: 1, createdAt: -1 }),
        db.collection("browserPushSubscriptions").createIndex({ endpoint: 1 }, { unique: true }),
        db.collection("browserPushSubscriptions").createIndex({ userId: 1, updatedAt: -1 }),
        db.collection("outbox").createIndex({ id: 1 }, { unique: true, name: "unique_outbox_id" }),
        db.collection("outbox").createIndex({ idempotencyKey: 1 }, { unique: true }),
        db.collection("webhookReceipts").createIndex({ eventId: 1 }, { unique: true }),
        db.collection("auditEvents").createIndex({ id: 1 }, { unique: true, name: "unique_audit_event_id" }),
      ]);
    },
  },
  {
    id: "2026-09-17-chat-invitations-and-discover",
    run: async (db) => {
      await assertNoDuplicateValues(db, [
        { collection: "messages", field: "id" },
        { collection: "clubInvitations", field: "id" },
      ]);
      await assertNoDuplicateKeys(db, [
        {
          collection: "messages",
          fields: ["authorId", "clientMessageId"],
          match: { clientMessageId: { $type: "string" } },
          label: "message client id per author",
        },
        {
          collection: "clubInvitations",
          fields: ["clubId", "status"],
          match: { status: "active" },
          label: "active club invitation",
        },
      ]);
      await Promise.all([
        db.collection("messages").createIndex({ id: 1 }, { unique: true, name: "unique_message_id" }),
        db.collection("messages").createIndex({ threadType: 1, threadId: 1, createdAt: -1 }),
        db.collection("messages").createIndex(
          { authorId: 1, clientMessageId: 1 },
          {
            unique: true,
            partialFilterExpression: { clientMessageId: { $type: "string" } },
            name: "unique_message_client_id_per_author",
          },
        ),
        db.collection("clubInvitations").createIndex({ id: 1 }, { unique: true }),
        db.collection("clubInvitations").createIndex(
          { clubId: 1, status: 1 },
          {
            unique: true,
            partialFilterExpression: { status: "active" },
            name: "one_active_club_invitation",
          },
        ),
        db.collection("clubs").createIndex(
          { name: "text", description: "text", "currentTheme.name": "text", "currentTheme.guidance": "text" },
          {
            name: "discover_club_search",
            weights: { name: 10, "currentTheme.name": 5, description: 2, "currentTheme.guidance": 1 },
          },
        ),
      ]);
    },
  },
  {
    id: "2026-09-17-durable-work-delivery",
    run: async (db) => {
      await deduplicateRateLimitBuckets(db);
      await assertNoDuplicateKeys(db, [
        {
          collection: "outboxDeliveries",
          fields: ["eventId", "userId"],
          label: "outbox delivery recipient",
        },
      ]);
      await Promise.all([
        db.collection("outbox").createIndex(
          { status: 1, availableAt: 1, leaseUntil: 1, createdAt: 1 },
          { name: "retryable_outbox_work" },
        ),
        db.collection("outboxDeliveries").createIndex(
          { eventId: 1, userId: 1 },
          { unique: true, name: "one_outbox_delivery_per_recipient" },
        ),
        db.collection("rateLimits").createIndex({ key: 1 }, { unique: true, name: "unique_rate_limit_bucket" }),
        db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
    },
  },
  {
    id: "2026-09-17-outbox-leases-chat-and-invitation-sessions",
    run: async (db) => {
      await assertNoDuplicateValues(db, [
        { collection: "clubInvitationSessions", field: "id" },
      ]);
      await assertNoDuplicateKeys(db, [
        {
          collection: "outboxPushDeliveries",
          fields: ["eventId", "userId", "subscriptionId"],
          label: "outbox push delivery destination",
        },
      ]);
      await Promise.all([
        db.collection("outbox").createIndex(
          { status: 1, availableAt: 1, createdAt: 1 },
          { name: "retryable_pending_outbox_work" },
        ),
        db.collection("outbox").createIndex(
          { status: 1, leaseUntil: 1, createdAt: 1 },
          { name: "expired_outbox_work_leases" },
        ),
        db.collection("outboxPushDeliveries").createIndex(
          { eventId: 1, userId: 1, subscriptionId: 1 },
          { unique: true, name: "one_outbox_push_delivery_per_subscription" },
        ),
        db.collection("messages").createIndex(
          { threadType: 1, threadId: 1, createdAt: -1, id: -1 },
          { name: "message_thread_cursor" },
        ),
        db.collection("clubInvitationSessions").createIndex(
          { id: 1 },
          { unique: true, name: "unique_club_invitation_session_id" },
        ),
        db.collection("clubInvitationSessions").createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0, name: "expire_club_invitation_sessions" },
        ),
      ]);
    },
  },
];

async function runIndexMigrations(db: Db): Promise<void> {
  const migrations = db.collection<{ _id: string; appliedAt: string }>("schemaMigrations");
  for (const migration of indexMigrations) {
    const applied = await migrations.findOne({ _id: migration.id }, { projection: { _id: 1 } });
    if (applied) continue;
    await migration.run(db);
    await migrations.updateOne(
      { _id: migration.id },
      { $setOnInsert: { appliedAt: new Date().toISOString() } },
      { upsert: true },
    );
  }
}

async function ensureIndexesForDb(db: Db): Promise<void> {
  if (!global.__dropdayIndexesPromise) {
    global.__dropdayIndexesPromise = runIndexMigrations(db).catch((error) => {
      global.__dropdayIndexesPromise = undefined;
      throw error;
    });
  }
  await global.__dropdayIndexesPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return getConnectedMongoClient();
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env.mongoDb);
}

export async function ensureIndexes(): Promise<void> {
  const client = await getConnectedMongoClient();
  await ensureIndexesForDb(client.db(env.mongoDb));
}
