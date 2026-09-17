import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";

type RateLimitBucket = { key: string; count: number; expiresAt: Date };

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === 11000,
  );
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!integrations.mongo) return true;
  const db = await getDb();
  const window = Math.floor(Date.now() / (windowSeconds * 1000));
  const bucketKey = `${key}:${window}`;
  const buckets = db.collection<RateLimitBucket>("rateLimits");
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date(Date.now() + windowSeconds * 2000) },
  };
  let result;
  try {
    result = await buckets.findOneAndUpdate(
      { key: bucketKey },
      update,
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Another request created the same uniquely indexed bucket between our
    // match and upsert. Increment that winner instead of dropping the request.
    result = await buckets.findOneAndUpdate(
      { key: bucketKey },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  }
  return (result?.count ?? 1) <= limit;
}
