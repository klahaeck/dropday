import { tasks } from "@trigger.dev/sdk";
import { normalizeDropReminderOffsets } from "@/lib/drop-reminder-settings";
import { integrations } from "@/lib/env";
import type { DropSlot } from "@/types/domain";

export async function scheduleDropTasks(drop: DropSlot, reminderOffsetsMinutes: number[]) {
  if (!integrations.trigger) return [];
  const runIds: string[] = [];
  const processHandle = await tasks.trigger(
    "process-drop",
    { dropId: drop.id, scheduleVersion: drop.scheduleVersion },
    { delay: new Date(drop.scheduledFor), idempotencyKey: `drop:${drop.occurrenceKey}` },
  );
  runIds.push(processHandle.id);
  for (const offset of normalizeDropReminderOffsets(reminderOffsetsMinutes)) {
    const runAt = new Date(new Date(drop.scheduledFor).getTime() - offset * 60_000);
    if (runAt <= new Date()) continue;
    const handle = await tasks.trigger(
      "send-drop-reminder",
      { dropId: drop.id, scheduleVersion: drop.scheduleVersion, offsetMinutes: offset },
      { delay: runAt, idempotencyKey: `reminder:${drop.occurrenceKey}:${offset}` },
    );
    runIds.push(handle.id);
  }
  return runIds;
}

export async function dispatchOutbox(outboxId: string, idempotencyKey: string) {
  if (!integrations.trigger) return;
  await tasks.trigger(
    "dispatch-outbox",
    { outboxId },
    { idempotencyKey: `outbox:${idempotencyKey}` },
  );
}
