import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/repository";

export async function PATCH() {
  const { profile } = await requireViewer();
  const updated = await markAllNotificationsRead(profile.id);
  return NextResponse.json({ updated });
}
