import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!integrations.mongo) return true;
  const db = await getDb();
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const bucketKey = `${key}:${window}`;
  const result = await db.collection<{ key: string; count: number; expiresAt: Date }>("rateLimits").findOneAndUpdate(
    { key: bucketKey },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + windowSeconds * 2000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return (result?.count ?? 1) <= limit;
}
