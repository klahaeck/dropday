import { describe, expect, it } from "vitest";
import {
  chatNotificationPreview,
  filterMentionCandidates,
  findMentionQuery,
  findMentionTokens,
  insertMention,
  resolveMentionedUserIds,
  type ChatMentionMember,
} from "@/lib/chat-mentions";

const members: ChatMentionMember[] = [
  { id: "user-lena", displayName: "Lena Ortiz", initials: "LO" },
  { id: "user-priya", displayName: "Priya Shah", initials: "PS" },
  { id: "user-theo", displayName: "Theo Brooks", initials: "TB" },
];

describe("chat mentions", () => {
  it("finds full-name mentions without treating email-like text as a mention", () => {
    expect(findMentionTokens(
      "Ask @Priya Shah, not priya@Priya Shah.",
      members,
    )).toEqual([{
      start: 4,
      end: 15,
      displayName: "Priya Shah",
      userIds: ["user-priya"],
    }]);
  });

  it("resolves unique members, deduplicates repeats, and excludes the author", () => {
    expect(resolveMentionedUserIds(
      "@Priya Shah, @Priya Shah, and @Lena Ortiz",
      members,
      [],
      "user-lena",
    )).toEqual(["user-priya"]);
  });

  it("requires a selected user id when active members share a display name", () => {
    const duplicateNames = [
      ...members,
      { id: "user-alex-1", displayName: "Alex Smith", initials: "AS" },
      { id: "user-alex-2", displayName: "Alex Smith", initials: "AS" },
    ];

    expect(resolveMentionedUserIds("@Alex Smith", duplicateNames)).toEqual([]);
    expect(resolveMentionedUserIds(
      "@Alex Smith",
      duplicateNames,
      ["user-alex-2", "outside-club"],
    )).toEqual(["user-alex-2"]);
  });

  it("filters member suggestions from the active query", () => {
    const body = "What do you think, @Sha";
    expect(findMentionQuery(body, body.length)).toEqual({
      start: 19,
      end: 23,
      query: "Sha",
    });
    expect(filterMentionCandidates(body, body.length, members)).toEqual([members[1]]);
  });

  it("inserts a selected full-name mention at the caret", () => {
    const body = "Thanks @Pri for this";
    const mention = findMentionQuery(body, 11);
    expect(mention).not.toBeNull();
    expect(insertMention(body, mention!, "Priya Shah")).toEqual({
      body: "Thanks @Priya Shah for this",
      caretPosition: 18,
    });
  });

  it("creates a compact notification preview", () => {
    expect(chatNotificationPreview("  First line\n\nsecond line  ", 20)).toBe("First line second…");
  });
});
