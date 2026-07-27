export interface ChatMentionMember {
  id: string;
  displayName: string;
  initials: string;
  imageUrl?: string;
}

export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export interface MentionToken {
  start: number;
  end: number;
  displayName: string;
  userIds: string[];
}

function isMentionWordCharacter(character: string | undefined): boolean {
  return Boolean(character && /[\p{L}\p{N}_]/u.test(character));
}

function normalizedName(displayName: string): string {
  return displayName.trim().toLocaleLowerCase();
}

function namesMatch(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

export function findMentionTokens(
  body: string,
  members: ChatMentionMember[],
): MentionToken[] {
  const membersByName = new Map<string, { displayName: string; userIds: string[] }>();

  for (const member of members) {
    const displayName = member.displayName.trim();
    if (!displayName) continue;
    const key = normalizedName(displayName);
    const existing = membersByName.get(key);
    if (existing) existing.userIds.push(member.id);
    else membersByName.set(key, { displayName, userIds: [member.id] });
  }

  const names = [...membersByName.values()]
    .sort((left, right) => right.displayName.length - left.displayName.length);
  const tokens: MentionToken[] = [];

  for (let start = 0; start < body.length; start += 1) {
    if (body[start] !== "@" || isMentionWordCharacter(body[start - 1])) continue;

    for (const candidate of names) {
      const end = start + candidate.displayName.length + 1;
      const visibleToken = body.slice(start, end);
      if (!namesMatch(visibleToken, `@${candidate.displayName}`)) continue;
      if (isMentionWordCharacter(body[end])) continue;

      tokens.push({
        start,
        end,
        displayName: body.slice(start + 1, end),
        userIds: candidate.userIds,
      });
      start = end - 1;
      break;
    }
  }

  return tokens;
}

export function resolveMentionedUserIds(
  body: string,
  members: ChatMentionMember[],
  requestedUserIds: string[] = [],
  authorId?: string,
): string[] {
  const tokens = findMentionTokens(body, members);
  const requested = new Set(requestedUserIds);
  const mentioned = new Set<string>();

  for (const token of tokens) {
    if (token.userIds.length === 1) mentioned.add(token.userIds[0]);
    for (const userId of token.userIds) {
      if (requested.has(userId)) mentioned.add(userId);
    }
  }

  if (authorId) mentioned.delete(authorId);
  return [...mentioned];
}

export function findMentionQuery(body: string, caretPosition: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caretPosition, body.length));
  const start = body.lastIndexOf("@", end - 1);
  if (start < 0 || isMentionWordCharacter(body[start - 1])) return null;

  const query = body.slice(start + 1, end);
  if (/[\r\n@]/.test(query)) return null;
  return { start, end, query };
}

export function filterMentionCandidates(
  body: string,
  caretPosition: number,
  members: ChatMentionMember[],
  limit = 6,
): ChatMentionMember[] {
  const mention = findMentionQuery(body, caretPosition);
  if (!mention) return [];
  const query = mention.query.trim().toLocaleLowerCase();

  return members
    .filter((member) => {
      const name = member.displayName.trim().toLocaleLowerCase();
      return !query
        || name.startsWith(query)
        || name.split(/\s+/).some((part) => part.startsWith(query));
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, limit);
}

export function insertMention(
  body: string,
  mention: MentionQuery,
  displayName: string,
): { body: string; caretPosition: number } {
  const before = body.slice(0, mention.start);
  const after = body.slice(mention.end);
  const visibleMention = `@${displayName.trim()}`;
  const needsSpace = !after || (!/^\s/.test(after) && !/^[,.:;!?)]/.test(after));
  const suffix = needsSpace ? " " : "";

  return {
    body: `${before}${visibleMention}${suffix}${after}`,
    caretPosition: before.length + visibleMention.length + suffix.length,
  };
}

export function chatNotificationPreview(body: string, maxLength = 160): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  const shortened = compact.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = shortened.lastIndexOf(" ");
  const wordSafe = lastSpace >= Math.floor(maxLength * .6)
    ? shortened.slice(0, lastSpace)
    : shortened;
  return `${wordSafe}…`;
}
