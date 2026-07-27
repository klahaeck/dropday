import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

declare global {
  var __dropdayMongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getDb(): Promise<Db> {
  if (!env.mongoUri) throw new Error("MONGODB_URI is not configured");
  if (!global.__dropdayMongoClientPromise) {
    const client = new MongoClient(env.mongoUri, { appName: "dropday" });
    global.__dropdayMongoClientPromise = client.connect();
  }
  const client = await global.__dropdayMongoClientPromise;
  return client.db(env.mongoDb);
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!env.mongoUri) throw new Error("MONGODB_URI is not configured");
  if (!global.__dropdayMongoClientPromise) {
    const client = new MongoClient(env.mongoUri, { appName: "dropday" });
    global.__dropdayMongoClientPromise = client.connect();
  }
  return global.__dropdayMongoClientPromise;
}

export async function ensureIndexes() {
  const db = await getDb();
  await Promise.all([
    db.collection("users").createIndex({ clerkUserId: 1 }, { unique: true }),
    db.collection("clubs").createIndex({ slug: 1 }, { unique: true }),
    db.collection("clubs").createIndex({ visibility: 1, "custody.status": 1, updatedAt: -1 }),
    db.collection("memberships").createIndex({ clubId: 1, userId: 1 }, { unique: true }),
    db.collection("memberships").createIndex({ userId: 1, status: 1 }),
    db.collection("joinRequests").createIndex(
      { clubId: 1, userId: 1 },
      { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_join_request_per_user" },
    ),
    db.collection("joinRequests").createIndex({ clubId: 1, status: 1, createdAt: 1 }),
    db.collection("drops").createIndex({ clubId: 1, occurrenceKey: 1 }, { unique: true }),
    db.collection("drops").createIndex({ clubId: 1, status: 1, scheduledFor: -1 }),
    db.collection("messages").createIndex({ threadType: 1, threadId: 1, createdAt: -1 }),
    db.collection("notifications").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("browserPushSubscriptions").createIndex({ endpoint: 1 }, { unique: true }),
    db.collection("browserPushSubscriptions").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("outbox").createIndex({ idempotencyKey: 1 }, { unique: true }),
    db.collection("webhookReceipts").createIndex({ eventId: 1 }, { unique: true }),
    db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
