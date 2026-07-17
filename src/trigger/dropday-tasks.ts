import { Rest } from "ably";
import { schedules, task } from "@trigger.dev/sdk";
import { archiveExpiredCustodyClubs } from "@/lib/billing-service";
import { getDb } from "@/lib/db";
import { sendDropdayEmail } from "@/lib/email";
import { env, integrations } from "@/lib/env";
import { processScheduledDrop } from "@/lib/drop-service";
import { createId } from "@/lib/repository";
import type {
  Club,
  ClubMembership,
  DropSlot,
  Notification,
  OutboxEvent,
  UserProfile,
} from "@/types/domain";

export const processDropTask = task({
  id: "process-drop",
  run: async (payload: { dropId: string; scheduleVersion: number }) => {
    return processScheduledDrop(payload.dropId, payload.scheduleVersion);
  },
});

export const sendDropReminderTask = task({
  id: "send-drop-reminder",
  run: async (payload: { dropId: string; scheduleVersion: number; offsetMinutes: number }) => {
    if (!integrations.mongo) return { status: "demo" };
    const db = await getDb();
    const drop = await db.collection<DropSlot>("drops").findOne({ id: payload.dropId });
    if (!drop || drop.status !== "scheduled" || drop.scheduleVersion !== payload.scheduleVersion) return { status: "stale" };
    const [club, user] = await Promise.all([
      db.collection<Club>("clubs").findOne({ id: drop.clubId }),
      db.collection<UserProfile>("users").findOne({ id: drop.assignedUserId }),
    ]);
    if (!club || !user) return { status: "missing" };
    const id = `notification_reminder_${drop.occurrenceKey}_${payload.offsetMinutes}`;
    const notification: Notification = {
      id, userId: user.id, kind: "reminder", title: `Your ${club.name} drop is coming up`,
      body: `${payload.offsetMinutes >= 1440 ? `${payload.offsetMinutes / 1440} day` : `${payload.offsetMinutes / 60} hour`} reminder for ${club.currentTheme.name}.`,
      href: `/app/clubs/${club.slug}`, createdAt: new Date().toISOString(),
    };
    await db.collection<Notification>("notifications").updateOne({ id }, { $setOnInsert: notification }, { upsert: true });
    if (user.primaryEmail && user.emailNotifications) await sendDropdayEmail({
      to: user.primaryEmail, subject: notification.title, heading: "You’re almost up.", body: notification.body,
      href: notification.href, idempotencyKey: id,
    });
    return { status: "sent", notificationId: id };
  },
});

export const dispatchOutboxTask = task({
  id: "dispatch-outbox",
  run: async (payload: { outboxId: string }) => {
    if (!integrations.mongo) return { status: "demo" };
    const db = await getDb();
    const event = await db.collection<OutboxEvent>("outbox").findOne({ id: payload.outboxId });
    if (!event || event.status === "delivered") return { status: "duplicate" };
    const clubId = typeof event.payload.clubId === "string" ? event.payload.clubId : undefined;
    if (!clubId) return { status: "invalid" };
    const [club, memberships] = await Promise.all([
      db.collection<Club>("clubs").findOne({ id: clubId }),
      db.collection<ClubMembership>("memberships").find({ clubId, status: "active" }).toArray(),
    ]);
    if (!club) return { status: "missing" };
    const targetIds = event.type === "drop.overdue" && typeof event.payload.assignedUserId === "string"
      ? [event.payload.assignedUserId]
      : memberships.map((membership) => membership.userId);
    const users = await db.collection<UserProfile>("users").find({ id: { $in: targetIds } }).toArray();
    const title = event.type === "drop.overdue" ? `A ${club.name} drop is overdue` : `A new playlist landed in ${club.name}`;
    const body = event.type === "drop.overdue"
      ? "The queue is holding. Add a late playlist or ask an admin to use a backup."
      : `${String(event.payload.title ?? "A new playlist")} is ready for the club.`;
    for (const user of users) {
      const notification: Notification = {
        id: createId("notification"), userId: user.id, kind: event.type === "drop.overdue" ? "overdue" : "published",
        title, body, href: `/app/clubs/${club.slug}`, createdAt: new Date().toISOString(),
      };
      await db.collection<Notification>("notifications").insertOne(notification);
      if (user.primaryEmail && user.emailNotifications) await sendDropdayEmail({
        to: user.primaryEmail, subject: title, heading: event.type === "drop.overdue" ? "The queue is waiting." : "Needle down.",
        body, href: notification.href, idempotencyKey: `${event.idempotencyKey}:${user.id}`,
      });
    }
    if (integrations.ably && env.ablyApiKey) {
      const ably = new Rest({ key: env.ablyApiKey });
      await ably.channels.get(`club:${club.id}`).publish(event.type, { title, body, eventId: event.id });
    }
    await db.collection<OutboxEvent>("outbox").updateOne({ id: event.id }, { $set: { status: "delivered", deliveredAt: new Date().toISOString() }, $inc: { attempts: 1 } });
    return { status: "delivered", recipients: users.length };
  },
});

export const archiveExpiredCustodyTask = schedules.task({
  id: "archive-expired-custody",
  cron: "17 * * * *",
  run: async () => {
    if (!integrations.mongo) return { status: "demo", archived: 0 };
    return { status: "complete", archived: await archiveExpiredCustodyClubs() };
  },
});
