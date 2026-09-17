"use client";

import Image from "next/image";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Send, SmilePlus, Users } from "lucide-react";
import type {
  ConnectionStateChange,
  InboundMessage,
  Realtime as RealtimeClient,
  RealtimeChannel,
} from "ably";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import {
  filterMentionCandidates,
  findMentionQuery,
  findMentionTokens,
  insertMention,
  resolveMentionedUserIds,
  type ChatMentionMember,
} from "@/lib/chat-mentions";
import { mergeChatMessages, reconcileSentMessage } from "@/lib/chat-messages";
import {
  applyCanonicalChatReaction,
  CHAT_QUICK_REACTIONS,
  rollbackOptimisticChatReaction,
  startOptimisticChatReaction,
  type ChatReactionClientState,
  type ChatReactionUpdate,
} from "@/lib/chat-reactions";
import {
  chatPresenceLabel,
  connectingChatPresence,
  readyChatPresence,
  unavailableChatPresence,
  type ChatPresenceState,
} from "@/lib/chat-presence";
import type { ChatMessage } from "@/types/domain";

interface MessagePagePayload {
  messages: ChatMessage[];
  olderCursor?: string;
  newerCursor?: string;
  hasMoreNewer: boolean;
}

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
  initialOlderCursor,
  initialNewerCursor,
  currentUser,
  mentionableUsers,
  realtimeEnabled,
}: {
  threadType: "club" | "drop";
  threadId: string;
  initialMessages: ChatMessage[];
  initialOlderCursor?: string;
  initialNewerCursor?: string;
  currentUser: { id: string; displayName: string; initials: string };
  mentionableUsers: ChatMentionMember[];
  realtimeEnabled: boolean;
}) {
  const [chatState, setChatState] = useState<ChatReactionClientState>({
    messages: initialMessages,
    pendingByMessageId: {},
  });
  const [body, setBody] = useState("");
  const [caretPosition, setCaretPosition] = useState(0);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionMenuDismissed, setMentionMenuDismissed] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reactionError, setReactionError] = useState("");
  const [olderCursor, setOlderCursor] = useState(initialOlderCursor);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [presence, setPresence] = useState<ChatPresenceState>(
    realtimeEnabled ? connectingChatPresence() : unavailableChatPresence(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const pendingReactionRequestsRef = useRef(new Set<string>());
  const newerCursorRef = useRef(initialNewerCursor);
  const catchingUpRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const retryMessageRef = useRef<{ body: string; clientMessageId: string } | null>(null);
  const messages = chatState.messages;
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
    let realtime: RealtimeClient | undefined;
    let channel: RealtimeChannel | undefined;
    let enteredPresence = false;

    const refreshPresence = async () => {
      if (disposed || !channel) return;
      try {
        const members = await channel.presence.get();
        if (!disposed) setPresence(readyChatPresence(members.length));
      } catch {
        if (!disposed) setPresence(unavailableChatPresence());
      }
    };
    const catchUpMessages = async () => {
      if (disposed || catchingUpRef.current) return;
      catchingUpRef.current = true;
      try {
        let cursor = newerCursorRef.current;
        for (let pageNumber = 0; pageNumber < 10 && !disposed; pageNumber += 1) {
          const query = new URLSearchParams({ threadType, threadId });
          if (cursor) query.set("after", cursor);
          const response = await fetch(`/api/chat?${query.toString()}`);
          if (!response.ok) return;
          const page = await response.json() as MessagePagePayload;
          if (disposed) return;
          setChatState((current) => ({
            ...current,
            messages: mergeChatMessages(current.messages, page.messages),
          }));
          cursor = page.newerCursor ?? cursor;
          newerCursorRef.current = cursor;
          if (!page.hasMoreNewer || !cursor) return;
        }
      } catch {
        return;
      } finally {
        catchingUpRef.current = false;
      }
    };
    const handleMessage = (event: InboundMessage) => {
      const message = event.data as ChatMessage;
      setChatState((current) => ({
        ...current,
        messages: message.clientMessageId
          ? reconcileSentMessage(current.messages, message.clientMessageId, message)
          : current.messages.some((item) => item.id === message.id)
            ? current.messages
            : [...current.messages, message],
      }));
    };
    const handleReaction = (event: InboundMessage) => {
      const update = event.data as ChatReactionUpdate;
      if (
        !update
        || typeof update.messageId !== "string"
        || !Array.isArray(update.reactions)
        || !Number.isInteger(update.reactionRevision)
      ) return;
      setChatState((current) => applyCanonicalChatReaction(
        current,
        update,
        currentUser.id,
      ));
    };
    const handlePresenceChange = () => {
      void refreshPresence();
    };
    const handleConnectionChange = (change: ConnectionStateChange) => {
      if (change.current === "failed" || change.current === "suspended" || change.current === "disconnected") {
        setPresence(unavailableChatPresence());
        return;
      }
      if (change.current === "connecting") {
        setPresence(connectingChatPresence());
        return;
      }
      if (change.current === "connected") {
        setPresence(connectingChatPresence());
        void refreshPresence();
        void catchUpMessages();
      }
    };
    const disposeRealtime = () => {
      const currentRealtime = realtime;
      const currentChannel = channel;
      const shouldLeave = enteredPresence;
      realtime = undefined;
      channel = undefined;
      enteredPresence = false;
      if (!currentRealtime || !currentChannel) return;
      currentChannel.unsubscribe("message", handleMessage);
      currentChannel.unsubscribe("reaction", handleReaction);
      currentChannel.presence.unsubscribe(["enter", "leave", "update"], handlePresenceChange);
      currentRealtime.connection.off(handleConnectionChange);
      if (shouldLeave) {
        void currentChannel.presence.leave().catch(() => undefined);
      }
      currentRealtime.close();
    };

    void import("ably").then(async ({ Realtime }) => {
      const client = new Realtime({ authUrl: `/api/ably/token?threadType=${threadType}&threadId=${threadId}` });
      realtime = client;
      channel = client.channels.get(channelName);
      if (disposed) {
        disposeRealtime();
        return;
      }
      client.connection.on([
        "connected",
        "connecting",
        "disconnected",
        "suspended",
        "failed",
      ], handleConnectionChange);
      await Promise.all([
        channel.subscribe("message", handleMessage),
        channel.subscribe("reaction", handleReaction),
        channel.presence.subscribe(["enter", "leave", "update"], handlePresenceChange),
      ]);
      if (disposed) {
        disposeRealtime();
        return;
      }
      await channel.presence.enter({ name: currentUser.displayName });
      enteredPresence = true;
      await refreshPresence();
      await catchUpMessages();
    }).catch(() => {
      disposeRealtime();
      if (!disposed) setPresence(unavailableChatPresence());
    });
    return () => {
      disposed = true;
      disposeRealtime();
    };
  }, [channelName, currentUser.displayName, currentUser.id, realtimeEnabled, threadId, threadType]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const messageWasAppended = messageCount > previousMessageCountRef.current;
    previousMessageCountRef.current = messageCount;

    if (loadingOlderRef.current) {
      loadingOlderRef.current = false;
      return;
    }

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
    const retry = retryMessageRef.current;
    const clientMessageId = retry?.body === text ? retry.clientMessageId : crypto.randomUUID();
    retryMessageRef.current = { body: text, clientMessageId };
    const optimistic: ChatMessage = {
      id: clientMessageId,
      threadType,
      threadId,
      authorId: currentUser.id,
      authorName: currentUser.displayName,
      authorInitials: currentUser.initials,
      clientMessageId,
      body: text,
      mentionedUserIds,
      reactions: [],
      reactionRevision: 0,
      createdAt: new Date().toISOString(),
    };
    setChatState((current) => ({
      ...current,
      messages: [...current.messages, optimistic],
    }));
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadType, threadId, clientMessageId, mentionedUserIds, body: text }),
      });
      if (!response.ok) throw new Error("Could not send message");
      const { message } = await response.json() as { message: ChatMessage };
      setChatState((current) => ({
        ...current,
        messages: reconcileSentMessage(current.messages, optimistic.id, message),
      }));
      retryMessageRef.current = null;
    } catch {
      setChatState((current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== optimistic.id),
      }));
      setBody(text);
      setCaretPosition(text.length);
      setSelectedMentionIds(mentionedUserIds);
      setSendError("Message not sent. Check your connection and try again.");
    }
  }

  function updateComposer(nextBody: string, nextCaretPosition: number) {
    if (retryMessageRef.current?.body !== nextBody.trim()) retryMessageRef.current = null;
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

  async function react(messageId: string, emoji: string) {
    if (pendingReactionRequestsRef.current.has(messageId)) return;
    pendingReactionRequestsRef.current.add(messageId);
    setReactionError("");
    setChatState((current) => startOptimisticChatReaction(
      current,
      messageId,
      currentUser.id,
      emoji,
    ));
    try {
      const response = await fetch(`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error("Could not save reaction");
      const update = await response.json() as ChatReactionUpdate;
      setChatState((current) => applyCanonicalChatReaction(
        current,
        update,
        currentUser.id,
        true,
      ));
    } catch {
      setChatState((current) => rollbackOptimisticChatReaction(current, messageId));
      setReactionError("Reaction not saved. Try again.");
    } finally {
      pendingReactionRequestsRef.current.delete(messageId);
    }
  }

  async function loadOlderMessages() {
    if (!olderCursor || historyBusy) return;
    setHistoryBusy(true);
    setHistoryError("");
    const viewport = messagesViewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    loadingOlderRef.current = true;
    try {
      const query = new URLSearchParams({ threadType, threadId, before: olderCursor });
      const response = await fetch(`/api/chat?${query.toString()}`);
      if (!response.ok) throw new Error("Could not load message history.");
      const page = await response.json() as MessagePagePayload;
      setChatState((current) => ({
        ...current,
        messages: mergeChatMessages(page.messages, current.messages),
      }));
      setOlderCursor(page.olderCursor);
      requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop += viewport.scrollHeight - previousHeight;
      });
    } catch {
      loadingOlderRef.current = false;
      setHistoryError("Could not load earlier messages. Try again.");
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div><span className="section-kicker">Live room</span><h2>{threadType === "club" ? "Club chat" : "Drop chat"}</h2></div>
        <span className="presence" aria-live="polite"><Users size={14} /> {chatPresenceLabel(presence)}</span>
      </header>
      <div className="chat-messages" ref={messagesViewportRef} aria-live="polite">
        {olderCursor && <button className="button button-ghost button-small" type="button" disabled={historyBusy} onClick={() => void loadOlderMessages()}>
          {historyBusy ? "Loading…" : "Load earlier messages"}
        </button>}
        {historyError && <p className="chat-composer-error" role="status">{historyError}</p>}
        {messages.map((message) => {
          const isCurrentUser = message.authorId === currentUser.id;
          const formattedTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt));
          return (
            <article className={`chat-message ${isCurrentUser ? "chat-message-mine" : ""}`} key={message.id}>
              {!isCurrentUser && <span className="chat-avatar">{message.authorInitials}</span>}
              <div>
                <p className="chat-byline">
                  {isCurrentUser ? <span className="sr-only">You</span> : <strong>{message.authorName}</strong>}
                  <time dateTime={message.createdAt}>{formattedTime}</time>
                </p>
                <Bubble
                  align={isCurrentUser ? "end" : "start"}
                  className="chat-bubble"
                  variant={isCurrentUser ? "default" : "secondary"}
                >
                  <BubbleContent className="chat-body">
                    {message.deletedAt ? "Message removed" : renderMessageBody(message.body, mentionableUsers)}
                  </BubbleContent>
                  <BubbleReactions
                    align={isCurrentUser ? "end" : "start"}
                    aria-label="Message reactions"
                    className="reaction-row"
                    role="group"
                  >
                    {message.reactions.filter((reaction) => reaction.userIds.length).map((reaction) => (
                      <button
                        type="button"
                        aria-label={`${reaction.userIds.includes(currentUser.id) ? "Remove" : "Add"} ${reaction.emoji} reaction; ${reaction.userIds.length} ${reaction.userIds.length === 1 ? "reaction" : "reactions"}`}
                        onClick={() => void react(message.id, reaction.emoji)}
                        disabled={Boolean(chatState.pendingByMessageId[message.id])}
                        key={reaction.emoji}
                      >
                        {reaction.emoji} {reaction.userIds.length}
                      </button>
                    ))}
                    <details className="reaction-picker">
                      <summary aria-label="Add reaction"><SmilePlus size={14} /></summary>
                      <span>{CHAT_QUICK_REACTIONS.map((emoji) => <button
                        type="button"
                        aria-label={`React with ${emoji}`}
                        key={emoji}
                        disabled={Boolean(chatState.pendingByMessageId[message.id])}
                        onClick={(event) => {
                          void react(message.id, emoji);
                          event.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                      >{emoji}</button>)}</span>
                    </details>
                  </BubbleReactions>
                </Bubble>
              </div>
            </article>
          );
        })}
        {!messages.length && <div className="empty-chat">Start the conversation when the needle drops.</div>}
      </div>
      {reactionError && <p className="chat-composer-error" role="status">{reactionError}</p>}
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
