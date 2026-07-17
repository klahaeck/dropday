import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import type { UserProfile } from "@/types/domain";

const themePreferenceSchema = z.object({
  themePreference: z.enum(["system", "light", "dark"]),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = themePreferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid theme preference" }, { status: 400 });

  if (integrations.mongo) {
    const timestamp = new Date().toISOString();
    await (await getDb()).collection<UserProfile>("users").updateOne(
      { id: viewer.profile.id },
      { $set: { themePreference: parsed.data.themePreference, updatedAt: timestamp } },
    );
  }

  return NextResponse.json({ themePreference: parsed.data.themePreference });
}
