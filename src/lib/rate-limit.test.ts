import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/env", () => ({ integrations: { mongo: true } }));

import { consumeRateLimit } from "@/lib/rate-limit";

describe("Mongo rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOneAndUpdate: mocks.findOneAndUpdate })),
    });
  });

  it("counts requests atomically in a uniquely indexed time bucket", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ count: 3 });

    await expect(consumeRateLimit("chat:user-1", 3, 60)).resolves.toBe(true);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringMatching(/^chat:user-1:\d+$/) }),
      expect.objectContaining({ $inc: { count: 1 } }),
      { upsert: true, returnDocument: "after" },
    );
  });

  it("increments the winning bucket after a concurrent upsert collision", async () => {
    mocks.findOneAndUpdate
      .mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: 11000 }))
      .mockResolvedValueOnce({ count: 4 });

    await expect(consumeRateLimit("chat:user-1", 3, 60)).resolves.toBe(false);
    expect(mocks.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: expect.stringMatching(/^chat:user-1:\d+$/) }),
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  });
});
