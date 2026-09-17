import { describe, expect, it } from "vitest";
import {
  chatPresenceLabel,
  connectingChatPresence,
  readyChatPresence,
  unavailableChatPresence,
} from "@/lib/chat-presence";

describe("chat presence", () => {
  it("does not show a number while connecting", () => {
    expect(chatPresenceLabel(connectingChatPresence())).toBe("Connecting live presence…");
  });

  it("only shows a count after a successful snapshot", () => {
    expect(chatPresenceLabel(readyChatPresence(3))).toBe("3 here");
  });

  it("clears the numeric count after realtime becomes unavailable", () => {
    expect(chatPresenceLabel(unavailableChatPresence())).toBe("Live presence unavailable");
  });
});
