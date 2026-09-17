import { NextResponse } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  CLUB_INVITATION_SESSION_COOKIE,
  clubInvitationSessionCookieOptions,
  createClubInvitationSession,
} from "@/lib/club-invitation-sessions";
import { getClubBySlug } from "@/lib/repository";

const schema = z.object({ token: z.string().min(1).max(200) });
const invalidInvitation = () => NextResponse.json(
  { error: "This invitation link is invalid or has expired." },
  { status: 403 },
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { profile } = await requireViewer();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
  }
  const club = await getClubBySlug(slug);
  if (!club || club.visibility !== "private" || club.custody.status === "archived") {
    return invalidInvitation();
  }
  const session = await createClubInvitationSession({
    clubId: club.id,
    userId: profile.id,
    invitationToken: parsed.data.token,
  });
  if (!session) {
    return invalidInvitation();
  }
  const response = NextResponse.json({ accepted: true });
  response.cookies.set(
    CLUB_INVITATION_SESSION_COOKIE,
    session.token,
    clubInvitationSessionCookieOptions(session.expiresAt),
  );
  return response;
}
