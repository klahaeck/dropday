import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { markNotificationRead } from "@/lib/repository";

const notificationIdSchema = z.string().trim().min(1).max(200);

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const { profile } = await requireViewer();
  const parsed = notificationIdSchema.safeParse((await params).notificationId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification." }, { status: 400 });
  }

  const updated = await markNotificationRead(profile.id, parsed.data);
  return NextResponse.json({ updated });
}
