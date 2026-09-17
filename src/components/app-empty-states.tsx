import Link from "next/link";
import { BellOff, CalendarClock, Compass, Music2, UsersRound, type LucideIcon } from "lucide-react";

type EmptyStateAction = { href: string; label: string; primary?: boolean };

const emptyStates = {
  "dashboard-no-clubs": {
    icon: UsersRound,
    title: "Start with a listening club.",
    body: "Join a public club or create a room for the people you already trade music with.",
    actions: [
      { href: "/app/discover", label: "Discover clubs", primary: true },
      { href: "/app/clubs/new", label: "New club" },
    ],
  },
  "dashboard-no-drop": {
    icon: CalendarClock,
    title: "No drop is scheduled yet.",
    body: "Your club is ready, but there is no upcoming turn to show. Check the club or prepare a playlist while you wait.",
    actions: [
      { href: "/app/clubs", label: "My clubs", primary: true },
      { href: "/app/library/new", label: "Prepare a playlist" },
    ],
  },
  "dashboard-no-activity": {
    icon: BellOff,
    title: "Nothing new yet.",
    body: "Assignments, membership updates, and new drops will appear here as your clubs get moving.",
    actions: [{ href: "/app/clubs", label: "Open my clubs", primary: true }],
  },
  "clubs-empty": {
    icon: Compass,
    title: "Find your first club.",
    body: "Discover a public rotation or create a private club for your own crew.",
    actions: [
      { href: "/app/discover", label: "Discover clubs", primary: true },
      { href: "/app/clubs/new", label: "New club" },
    ],
  },
  "notifications-empty": {
    icon: Music2,
    title: "You are all caught up.",
    body: "New assignments, mentions, and membership updates will appear here.",
    actions: [{ href: "/app", label: "Back to dashboard", primary: true }],
  },
} satisfies Record<string, { icon: LucideIcon; title: string; body: string; actions: EmptyStateAction[] }>;

export type AppEmptyStateKind = keyof typeof emptyStates;

export function AppEmptyState({ kind }: { kind: AppEmptyStateKind }) {
  const state = emptyStates[kind];
  const Icon = state.icon;

  return <section className="empty-state app-empty-state">
    <Icon size={32} />
    <h2>{state.title}</h2>
    <p>{state.body}</p>
    <div className="app-empty-state-actions">
      {state.actions.map((action) => <Link
        key={action.href}
        href={action.href}
        className={`button ${action.primary ? "button-dark" : "button-ghost"}`}
      >
        {action.label}
      </Link>)}
    </div>
  </section>;
}
