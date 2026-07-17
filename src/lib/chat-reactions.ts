import type { ChatReaction } from "@/types/domain";

export function toggleChatReaction(
  reactions: ChatReaction[],
  userId: string,
  emoji: string,
): ChatReaction[] {
  const removingActiveReaction = reactions.some(
    (reaction) => reaction.emoji === emoji && reaction.userIds.includes(userId),
  );
  const reactionsWithoutUser = reactions
    .map((reaction) => ({
      ...reaction,
      userIds: reaction.userIds.filter((id) => id !== userId),
    }))
    .filter((reaction) => reaction.userIds.length > 0);

  if (removingActiveReaction) return reactionsWithoutUser;

  const existingReaction = reactionsWithoutUser.find((reaction) => reaction.emoji === emoji);
  if (existingReaction) {
    return reactionsWithoutUser.map((reaction) => reaction.emoji === emoji
      ? { ...reaction, userIds: [...reaction.userIds, userId] }
      : reaction);
  }

  return [...reactionsWithoutUser, { emoji, userIds: [userId] }];
}
