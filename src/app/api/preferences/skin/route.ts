import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/env";
import { isSkinPreference } from "@/lib/skin";
import type { UserProfile } from "@/types/domain";

const skinPreferenceSchema = z.object({
  // Validated through the registry's guard so the accepted set never drifts.
  skinPreference: z.string().refine(isSkinPreference),
});

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = skinPreferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid design preference" }, { status: 400 });

  if (integrations.mongo) {
    const timestamp = new Date().toISOString();
    await (await getDb()).collection<UserProfile>("users").updateOne(
      { id: viewer.profile.id },
      { $set: { skinPreference: parsed.data.skinPreference, updatedAt: timestamp } },
    );
  }

  return NextResponse.json({ skinPreference: parsed.data.skinPreference });
}
