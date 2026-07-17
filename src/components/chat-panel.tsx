"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Send, SmilePlus, Users } from "lucide-react";
import { toggleChatReaction } from "@/lib/chat-reactions";
import { normalizeClubAccent } from "@/lib/club-accent";
import type { ChatMessage } from "@/types/domain";

const quickReactions = ["🔥", "💿", "❤️", "🫡"];

export function ChatPanel({
  threadType,
  threadId,
  initialMessages,
  currentUser,
  realtimeEnabled,
  clubAccent,
}: {
  threadType: "club" | "drop";
  threadId: string;
  initialMessages: ChatMessage[];
  currentUser: { id: string; displayName: string; initials: string };
  realtimeEnabled: boolean;
  clubAccent?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [typing, setTyping] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(realtimeEnabled ? 1 : 4);
  const channelName = useMemo(() => `${threadType}:${threadId}`, [threadId, threadType]);

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
        const message = event.data as ChatMessage;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      });
      channel.subscribe("typing", (event) => {
        const data = event.data as { userId: string; name: string; typing: boolean };
        if (data.userId !== currentUser.id) setTyping(data.typing ? data.name : null);
      });
    });
    return () => { disposed = true; realtime?.close(); };
  }, [channelName, currentUser.displayName, currentUser.id, realtimeEnabled, threadId, threadType]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      threadType,
      threadId,
      authorId: currentUser.id,
      authorName: currentUser.displayName,
      authorInitials: currentUser.initials,
      body: text,
      reactions: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    if (realtimeEnabled) {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadType, threadId, body: text }),
      });
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
      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <article className={`chat-message ${message.authorId === currentUser.id ? "chat-message-mine" : ""}`} key={message.id}>
            <span className="chat-avatar">{message.authorInitials}</span>
            <div>
              <p className="chat-byline"><strong>{message.authorName}</strong><time>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</time></p>
              <p className="chat-body">{message.deletedAt ? "Message removed" : message.body}</p>
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
        ))}
        {!messages.length && <div className="empty-chat">Start the conversation when the needle drops.</div>}
      </div>
      <div className="typing-line">{typing ? `${typing} is typing…` : " "}</div>
      <form className="chat-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`${threadId}-message`}>Message</label>
        <input id={`${threadId}-message`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} placeholder="Add to the conversation…" />
        <button type="submit" aria-label="Send message"><Send size={17} /></button>
      </form>
    </section>
  );
}
