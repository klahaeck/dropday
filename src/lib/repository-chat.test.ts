import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {},
  integrations: {
    ably: false,
    browserPush: false,
    clerk: false,
    mongo: false,
    resend: false,
    trigger: false,
  },
}));

import { demoMessages } from "@/lib/demo-data";
import { insertMessage, listMessagesPage } from "@/lib/repository";
import type { ChatMessage } from "@/types/domain";

const TEST_PREFIX = "pagination-test-";

function message(index: number, clientMessageId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`): ChatMessage {
  return {
    id: `${TEST_PREFIX}${String(index).padStart(3, "0")}`,
    threadType: "club",
    threadId: `${TEST_PREFIX}thread`,
    authorId: "user-test",
    authorName: "Test Listener",
    authorInitials: "TL",
    clientMessageId,
    body: `Message ${index}`,
    reactions: [],
    createdAt: new Date(Date.UTC(2026, 8, 17, 12, 0, index)).toISOString(),
  };
}

afterEach(() => {
  for (let index = demoMessages.length - 1; index >= 0; index -= 1) {
    if (demoMessages[index]?.id.startsWith(TEST_PREFIX)) demoMessages.splice(index, 1);
  }
});

describe("chat message storage", () => {
  it("returns the newest window and pages backward in chronological display order", async () => {
    demoMessages.push(...Array.from({ length: 25 }, (_, index) => message(index)));

    const newest = await listMessagesPage("club", `${TEST_PREFIX}thread`, { limit: 10 });
    expect(newest.messages.map((item) => item.body)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Message ${index + 15}`),
    );
    expect(newest.olderCursor).toBeTruthy();

    const older = await listMessagesPage("club", `${TEST_PREFIX}thread`, {
      before: newest.olderCursor,
      limit: 10,
    });
    expect(older.messages.map((item) => item.body)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Message ${index + 5}`),
    );
  });

  it("supports reconnect catch-up after the newest cursor", async () => {
    demoMessages.push(message(1), message(2));
    const initial = await listMessagesPage("club", `${TEST_PREFIX}thread`);
    demoMessages.push(message(3));

    const catchUp = await listMessagesPage("club", `${TEST_PREFIX}thread`, {
      after: initial.newerCursor,
    });
    expect(catchUp.messages.map((item) => item.body)).toEqual(["Message 3"]);
  });

  it("deduplicates retried sends by author and client message ID", async () => {
    const first = message(1);
    const duplicate = { ...message(2, first.clientMessageId), body: "Retry body" };

    await expect(insertMessage(first)).resolves.toEqual({ message: first, created: true });
    await expect(insertMessage(duplicate)).resolves.toEqual({ message: first, created: false });
    expect(demoMessages.filter((item) => item.id.startsWith(TEST_PREFIX))).toHaveLength(1);
  });
});
