import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  decideJoinRequest,
  JoinRequestDecisionError,
} from "@/lib/join-request-service";

const schema = z.object({ decision: z.enum(["approve", "decline"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { profile, features } = await requireViewer();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid join-request decision." }, { status: 400 });
  const { requestId } = await params;

  try {
    const result = await decideJoinRequest({
      requestId,
      decision: parsed.data.decision,
      actorUserId: profile.id,
      hasClubAdminTools: features.clubAdminTools,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JoinRequestDecisionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not update this join request." }, { status: 500 });
  }
}
