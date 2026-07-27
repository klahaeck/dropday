import type { ChatMessage } from "@/types/domain";

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
