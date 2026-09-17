import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import {
  revokeActiveClubInvitation,
  rotateClubInvitation,
} from "@/lib/club-invitations";
import { canUseClubManagement } from "@/lib/club-management";
import { getClubBySlug, getClubMemberships } from "@/lib/repository";

async function authorizeInvitationManagement(slug: string) {
  const { profile, features } = await requireViewer();
  const club = await getClubBySlug(slug);
  if (!club || club.custody.status === "archived") return null;
  const memberships = await getClubMemberships(club.id);
  const membership = memberships.find((candidate) => candidate.userId === profile.id);
  if (!canUseClubManagement(membership, features.clubAdminTools)) return null;
  return { club, profile };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await authorizeInvitationManagement(slug);
  if (!access) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  if (access.club.visibility !== "private") {
    return NextResponse.json({ error: "Public clubs do not require invitation links." }, { status: 409 });
  }
  const rotated = await rotateClubInvitation(access.club.id, access.profile.id);
  return NextResponse.json({
    token: rotated.token,
    expiresAt: rotated.invitation.expiresAt,
  }, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await authorizeInvitationManagement(slug);
  if (!access) return NextResponse.json({ error: "Club not found." }, { status: 404 });
  await revokeActiveClubInvitation(access.club.id);
  return new NextResponse(null, { status: 204 });
}
