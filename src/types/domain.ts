import type { SkinPreference } from "@/lib/skin";

export type Id = string;
export type IsoDate = string;

export type PlanKey = "free" | "entry" | "middle" | "highest";
export type ClubVisibility = "public" | "private";
export type ClubRole = "owner" | "admin" | "member";
export type ClubLifecycle = "active" | "grace" | "archived";
export type DropStatus = "scheduled" | "overdue" | "published" | "skipped" | "cancelled";
export type PlaylistProvider = "spotify" | "apple-music";
export type ThemePreference = "system" | "light" | "dark";
/** Derived from the skin registry so adding a design only touches lib/skin.ts. */
export type { SkinPreference };
export type EmailPreferenceKey =
  | "assignments"
  | "reminders"
  | "clubActivity"
  | "membership"
  | "billing";
export type EmailPreferences = Record<EmailPreferenceKey, boolean>;
export type NotificationKind =
  | "invitation"
  | "membership"
  | "mention"
  | "assignment"
  | "theme"
  | "reminder"
  | "published"
  | "overdue"
  | "entitlement"
  | "custody"
  | "billing";

export interface UserProfile {
  id: Id;
  clerkUserId: string;
  displayName: string;
  initials: string;
  imageUrl?: string;
  primaryEmail?: string;
  plan: PlanKey;
  emailNotifications: boolean;
  emailPreferences?: EmailPreferences;
  themePreference: ThemePreference;
  skinPreference: SkinPreference;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface RecurrenceConfig {
  timezone: string;
  startsOn: string;
  localTime: string;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[];
  monthDays?: number[];
  ordinalWeekdays?: Array<{ ordinal: 1 | 2 | 3 | 4 | -1; weekday: number }>;
  rrule: string;
  reminderOffsetsMinutes: number[];
  version: number;
  paused: boolean;
}

export interface ClubTheme {
  name: string;
  guidance?: string;
  guidanceHtml?: string;
  imageUrl?: string;
  version: number;
  updatedAt: IsoDate;
}

export interface OwnershipCustody {
  status: ClubLifecycle;
  activeOwnerId: Id | null;
  recoveryClaimantId: Id | null;
  reason?: "plan-ended" | "tier-downgrade" | "manual-archive";
  graceEndsAt?: IsoDate;
  archivedAt?: IsoDate;
}

export interface Club {
  id: Id;
  slug: string;
  name: string;
  description: string;
  descriptionHtml?: string;
  imageUrl?: string;
  visibility: ClubVisibility;
  accent: string;
  memberCount: number;
  rotationMemberIds: Id[];
  currentTheme?: ClubTheme;
  themeHistory?: ClubTheme[];
  savedThemes?: ClubTheme[];
  schedule: RecurrenceConfig;
  activeDropId?: Id;
  custody: OwnershipCustody;
  joinToken?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ClubMembership {
  id: Id;
  clubId: Id;
  userId: Id;
  role: ClubRole;
  status: "active" | "left" | "removed";
  queuePaused: boolean;
  joinedAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ClubInvitation {
  id: Id;
  clubId: Id;
  email: string;
  invitedByUserId: Id;
  tokenHash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: IsoDate;
  createdAt: IsoDate;
}

export interface JoinRequest {
  id: Id;
  clubId: Id;
  userId: Id;
  message?: string;
  status: "pending" | "approved" | "declined" | "blocked-by-entitlement";
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface PlaylistMetadata {
  providerTitle?: string;
  artworkUrl?: string;
  ownerName?: string;
  trackCount?: number;
}

export interface PlaylistVersion {
  provider: PlaylistProvider;
  providerPlaylistId: string;
  canonicalUrl: string;
  embedUrl: string;
}

export interface PlaylistSnapshot extends PlaylistVersion {
  sourceDraftId?: Id;
  versions?: PlaylistVersion[];
  title: string;
  description: string;
  descriptionHtml?: string;
  metadata: PlaylistMetadata;
  theme?: ClubTheme;
}

export interface PlaylistDraft extends PlaylistVersion {
  id: Id;
  ownerId: Id;
  versions?: PlaylistVersion[];
  title: string;
  description: string;
  descriptionHtml?: string;
  metadata: PlaylistMetadata;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ClubBackup {
  id: Id;
  clubId: Id;
  addedByUserId: Id;
  playlist: Omit<PlaylistSnapshot, "theme">;
  status: "available" | "used" | "retired";
  usedAt?: IsoDate;
  createdAt: IsoDate;
}

export interface ReplacementOutcome {
  originalAssigneeId: Id;
  replacementPublisherId: Id;
  backupId?: Id;
  queueEffect: "consumeTurn" | "preserveTurn";
}

export interface DropSlot {
  id: Id;
  clubId: Id;
  occurrenceKey: string;
  scheduleVersion: number;
  status: DropStatus;
  assignedUserId: Id;
  scheduledFor: IsoDate;
  publishedAt?: IsoDate;
  playlist?: PlaylistSnapshot;
  replacement?: ReplacementOutcome;
  triggerRunIds?: string[];
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface ChatReaction {
  emoji: string;
  userIds: Id[];
}

export interface ChatMessage {
  id: Id;
  threadType: "club" | "drop";
  threadId: Id;
  authorId: Id;
  authorName: string;
  authorInitials: string;
  body: string;
  mentionedUserIds?: Id[];
  reactions: ChatReaction[];
  deletedAt?: IsoDate;
  createdAt: IsoDate;
}

export interface ChatReadState {
  id: Id;
  threadType: "club" | "drop";
  threadId: Id;
  userId: Id;
  lastReadAt: IsoDate;
}

export interface Notification {
  id: Id;
  userId: Id;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  readAt?: IsoDate;
  createdAt: IsoDate;
}

export interface BrowserPushSubscription {
  id: Id;
  userId: Id;
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface MembershipEntitlement {
  activeMembershipCount: number;
  joinLimit: number | null;
  isGrandfathered: boolean;
  canActivateMembership: boolean;
  blockedReason?: "free-membership-limit";
}

export interface OwnershipEntitlement {
  plan: PlanKey;
  ownedClubLimit: number | null;
  ownedClubCount: number;
  availableCapacity: number | null;
  canOwnAnotherClub: boolean;
}

export interface OutboxEvent {
  id: Id;
  type: string;
  aggregateId: Id;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  idempotencyKey: string;
  createdAt: IsoDate;
  deliveredAt?: IsoDate;
}

export interface AuditEvent {
  id: Id;
  clubId?: Id;
  actorUserId?: Id;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: IsoDate;
}
