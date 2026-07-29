import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import type { EmailPreferences, UserProfile } from "@/types/domain";

const emailPreferencesSchema = z.object({
  assignments: z.boolean(),
  reminders: z.boolean(),
  clubActivity: z.boolean(),
  membership: z.boolean(),
  billing: z.boolean(),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = emailPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email preferences" }, { status: 400 });

  const emailPreferences: EmailPreferences = parsed.data;
  if (integrations.mongo) {
    const timestamp = new Date().toISOString();
    await (await getDb()).collection<UserProfile>("users").updateOne(
      { id: viewer.profile.id },
      {
        $set: {
          emailPreferences,
          emailNotifications: Object.values(emailPreferences).some(Boolean),
          updatedAt: timestamp,
        },
      },
    );
  }

  return NextResponse.json({ emailPreferences });
}
