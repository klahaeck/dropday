export type ChatPresenceState =
  | { status: "connecting" }
  | { status: "ready"; count: number }
  | { status: "unavailable" };

export function connectingChatPresence(): ChatPresenceState {
  return { status: "connecting" };
}

export function readyChatPresence(count: number): ChatPresenceState {
  return { status: "ready", count: Math.max(0, Math.trunc(count)) };
}

export function unavailableChatPresence(): ChatPresenceState {
  return { status: "unavailable" };
}

export function chatPresenceLabel(state: ChatPresenceState) {
  if (state.status === "connecting") return "Connecting live presence…";
  if (state.status === "unavailable") return "Live presence unavailable";
  return `${state.count} here`;
}
