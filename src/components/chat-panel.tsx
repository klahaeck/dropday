"use client";

import Image from "next/image";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Send, SmilePlus, Users } from "lucide-react";
import {
  filterMentionCandidates,
  findMentionQuery,
  findMentionTokens,
  insertMention,
  resolveMentionedUserIds,
  type ChatMentionMember,
} from "@/lib/chat-mentions";
import { reconcileSentMessage } from "@/lib/chat-messages";
import { toggleChatReaction } from "@/lib/chat-reactions";
import { normalizeClubAccent } from "@/lib/club-accent";
import type { ChatMessage } from "@/types/domain";

const quickReactions = ["🔥", "💿", "❤️", "🫡"];

type RealtimeChatMessage = ChatMessage & { clientMessageId?: string };

function renderMessageBody(body: string, members: ChatMentionMember[]) {
  const tokens = findMentionTokens(body, members);
  if (!tokens.length) return body;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) parts.push(body.slice(cursor, token.start));
    parts.push(<strong className="chat-mention" key={`${token.start}-${token.end}`}>{body.slice(token.start, token.end)}</strong>);
    cursor = token.end;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return parts;
}

export function ChatPanel({
  threadType,
  threadId,
  initialMessages,
  currentUser,
  mentionableUsers,
  realtimeEnabled,
  clubAccent,
}: {
  threadType: "club" | "drop";
  threadId: string;
  initialMessages: ChatMessage[];
  currentUser: { id: string; displayName: string; initials: string };
  mentionableUsers: ChatMentionMember[];
  realtimeEnabled: boolean;
  clubAccent?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [caretPosition, setCaretPosition] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [sendError, setSendError] = useState("");
  const [typing, setTyping] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(realtimeEnabled ? 1 : 4);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);
  const hasPositionedMessagesRef = useRef(false);
  const messageCount = messages.length;
  const channelName = useMemo(() => `${threadType}:${threadId}`, [threadId, threadType]);
  const mentionCandidates = useMemo(
    () => filterMentionCandidates(
      body,
      caretPosition,
      mentionableUsers.filter((member) => member.id !== currentUser.id),
    ),
    [body, caretPosition, currentUser.id, mentionableUsers],
  );
  const mentionMenuOpen = !mentionMenuDismissed
    && mentionCandidates.length > 0
    && Boolean(findMentionQuery(body, caretPosition));

  useEffect(() => {
    if (!realtimeEnabled) return;
    let disposed = false;
    let realtime: { close: () => void } | undefined;
    void import("ably").then(({ Realtime }) => {
      if (disposed) return;
      const client = new Realtime({ authUrl: `/api/ably/token?threadType=${threadType}&threadId=${threadId}` });
      realtime = client;
      const channel = client.channels.get(channelName);
      void channel.presence.enter({ name: currentUser.displayName });
      void channel.presence.get().then((members) => setOnlineCount(members.length));
      channel.subscribe("message", (event) => {
        const { clientMessageId, ...message } = event.data as RealtimeChatMessage;
        setMessages((current) => clientMessageId
          ? reconcileSentMessage(current, clientMessageId, message)
          : current.some((item) => item.id === message.id) ? current : [...current, message]);
      });
      channel.subscribe("typing", (event) => {
        const data = event.data as { userId: string; name: string; typing: boolean };
        if (data.userId !== currentUser.id) setTyping(data.typing ? data.name : null);
      });
    });
    return () => { disposed = true; realtime?.close(); };
  }, [channelName, currentUser.displayName, currentUser.id, realtimeEnabled, threadId, threadType]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const messageWasAppended = messageCount > previousMessageCountRef.current;
    previousMessageCountRef.current = messageCount;

    if (!viewport || (hasPositionedMessagesRef.current && !messageWasAppended)) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: hasPositionedMessagesRef.current ? "smooth" : "auto",
    });
    hasPositionedMessagesRef.current = true;
  }, [messageCount]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    const mentionedUserIds = resolveMentionedUserIds(
      text,
      mentionableUsers,
      selectedMentionIds,
      currentUser.id,
    );
    setSendError("");
    setBody("");
    setCaretPosition(0);
    setSelectedMentionIds([]);
    setMentionMenuDismissed(true);
    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: clientMessageId,
      threadType,
      threadId,
      authorId: currentUser.id,
      authorName: currentUser.displayName,
      authorInitials: currentUser.initials,
      body: text,
      mentionedUserIds,
      reactions: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadType, threadId, clientMessageId, mentionedUserIds, body: text }),
      });
      if (!response.ok) throw new Error("Could not send message");
      const { message } = await response.json() as { message: ChatMessage };
      setMessages((current) => reconcileSentMessage(current, optimistic.id, message));
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setBody(text);
      setCaretPosition(text.length);
      setSelectedMentionIds(mentionedUserIds);
      setSendError("Message not sent. Check your connection and try again.");
    }
  }

  function updateComposer(nextBody: string, nextCaretPosition: number) {
    setBody(nextBody);
    setCaretPosition(nextCaretPosition);
    setActiveMentionIndex(0);
    setMentionMenuDismissed(false);
    setSendError("");
    setSelectedMentionIds((current) => resolveMentionedUserIds(
      nextBody,
      mentionableUsers,
      current,
      currentUser.id,
    ));
  }

  function chooseMention(member: ChatMentionMember) {
    const mention = findMentionQuery(body, caretPosition);
    if (!mention) return;
    const insertion = insertMention(body, mention, member.displayName);
    if (insertion.body.length > 1000) return;

    setBody(insertion.body);
    setCaretPosition(insertion.caretPosition);
    setSelectedMentionIds((current) => [...new Set([...current, member.id])]);
    setMentionMenuDismissed(true);
    setActiveMentionIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(insertion.caretPosition, insertion.caretPosition);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!mentionMenuOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMentionIndex((current) => (current + 1) % mentionCandidates.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMentionIndex((current) => (current - 1 + mentionCandidates.length) % mentionCandidates.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      chooseMention(mentionCandidates[activeMentionIndex] ?? mentionCandidates[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMentionMenuDismissed(true);
    }
  }

  function react(messageId: string, emoji: string) {
    setMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      return {
        ...message,
        reactions: toggleChatReaction(message.reactions, currentUser.id, emoji),
      };
    }));
  }

  return (
    <section className={`chat-panel${threadType === "club" ? " chat-panel-club" : ""}`} style={threadType === "club" ? { "--club-accent": normalizeClubAccent(clubAccent) } as React.CSSProperties : undefined}>
      <header className="chat-header">
        <div><span className="section-kicker">Live room</span><h2>{threadType === "club" ? "Club chat" : "Drop chat"}</h2></div>
        <span className="presence"><Users size={14} /> {onlineCount} here</span>
      </header>
      <div className="chat-messages" ref={messagesViewportRef} aria-live="polite">
        {messages.map((message) => {
          const isCurrentUser = message.authorId === currentUser.id;
          const formattedTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt));
          return (
            <article className={`chat-message ${isCurrentUser ? "chat-message-mine" : ""}`} key={message.id}>
              {!isCurrentUser && <span className="chat-avatar">{message.authorInitials}</span>}
              <div>
                <p className="chat-byline">
                  {isCurrentUser ? <span className="sr-only">You</span> : <strong>{message.authorName}</strong>}
                  <time>{formattedTime}</time>
                </p>
                <p className="chat-body">{message.deletedAt ? "Message removed" : renderMessageBody(message.body, mentionableUsers)}</p>
                <div className="reaction-row">
                  {message.reactions.filter((reaction) => reaction.userIds.length).map((reaction) => (
                    <button type="button" onClick={() => react(message.id, reaction.emoji)} key={reaction.emoji}>{reaction.emoji} {reaction.userIds.length}</button>
                  ))}
                  <details className="reaction-picker"><summary><SmilePlus size={14} /></summary><span>{quickReactions.map((emoji) => <button type="button" key={emoji} onClick={(event) => {
                    react(message.id, emoji);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}>{emoji}</button>)}</span></details>
                </div>
              </div>
            </article>
          );
        })}
        {!messages.length && <div className="empty-chat">Start the conversation when the needle drops.</div>}
      </div>
      <div className="typing-line">{typing ? `${typing} is typing…` : " "}</div>
      <form className="chat-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`${threadId}-message`}>Message</label>
        <input
          ref={inputRef}
          id={`${threadId}-message`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${threadId}-mention-list`}
          aria-expanded={mentionMenuOpen}
          aria-activedescendant={mentionMenuOpen ? `${threadId}-mention-${mentionCandidates[activeMentionIndex]?.id}` : undefined}
          value={body}
          onChange={(event) => updateComposer(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onClick={(event) => updateComposer(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onKeyDown={handleComposerKeyDown}
          onSelect={(event) => setCaretPosition(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          maxLength={1000}
          placeholder="Message… Type @ to mention someone"
        />
        {mentionMenuOpen && <div className="mention-menu" id={`${threadId}-mention-list`} role="listbox" aria-label="Club members">
          {mentionCandidates.map((member, index) => <button
            type="button"
            role="option"
            aria-selected={index === activeMentionIndex}
            className={`mention-option${index === activeMentionIndex ? " mention-option-active" : ""}`}
            id={`${threadId}-mention-${member.id}`}
            key={member.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => chooseMention(member)}
          >
            <span className="mention-avatar">{member.imageUrl ? <Image src={member.imageUrl} alt="" width={34} height={34} unoptimized /> : member.initials}</span>
            <span><strong>{member.displayName}</strong><small>Mention in this chat</small></span>
          </button>)}
        </div>}
        <button className="chat-send-button" type="submit" aria-label="Send message" disabled={!body.trim()}><Send size={17} /></button>
        {sendError && <p className="chat-composer-error" role="status">{sendError}</p>}
      </form>
    </section>
  );
}
