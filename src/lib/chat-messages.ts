import type { ChatMessage } from "@/types/domain";

function compareChatMessages(left: ChatMessage, right: ChatMessage): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareChatMessages);
}

export function reconcileSentMessage(
  messages: ChatMessage[],
  optimisticMessageId: string,
  serverMessage: ChatMessage,
): ChatMessage[] {
  const reconciled: ChatMessage[] = [];
  let insertedServerMessage = false;

  for (const message of messages) {
    if (message.id === optimisticMessageId || message.id === serverMessage.id) {
      if (!insertedServerMessage) {
        reconciled.push(serverMessage);
        insertedServerMessage = true;
      }
      continue;
    }

    reconciled.push(message);
  }

  if (!insertedServerMessage) reconciled.push(serverMessage);

  return reconciled;
}
