import { describe, expect, it } from "vitest";
import { reconcileSentMessage } from "@/lib/chat-messages";
import type { ChatMessage } from "@/types/domain";

const optimisticMessage: ChatMessage = {
  id: "8d153c79-9e49-47fa-8e6f-9dbb2795c24d",
  threadType: "drop",
  threadId: "drop-1",
  authorId: "user-1",
  authorName: "Kla",
  authorInitials: "K",
  body: "hello",
  reactions: [],
  createdAt: "2026-07-27T18:33:00.000Z",
};

const serverMessage: ChatMessage = {
  ...optimisticMessage,
  id: "message-1",
  createdAt: "2026-07-27T18:33:00.100Z",
};

describe("sent chat message reconciliation", () => {
  it("replaces the optimistic message with the server message", () => {
    expect(reconcileSentMessage([optimisticMessage], optimisticMessage.id, serverMessage)).toEqual([
      serverMessage,
    ]);
  });

  it("collapses the optimistic and realtime copies when realtime arrives first", () => {
    expect(
      reconcileSentMessage(
        [optimisticMessage, serverMessage],
        optimisticMessage.id,
        serverMessage,
      ),
    ).toEqual([serverMessage]);
  });

  it("does not duplicate a server message that realtime already reconciled", () => {
    expect(reconcileSentMessage([serverMessage], optimisticMessage.id, serverMessage)).toEqual([
      serverMessage,
    ]);
  });
});
