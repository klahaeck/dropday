import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import {
  ClubMembershipTransitionError,
  transitionClubMembership,
} from "@/lib/club-membership-service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { profile, features } = await requireViewer();
  try {
    const outcome = await transitionClubMembership({
      clubSlug: slug,
      targetUserId: profile.id,
      actorUserId: profile.id,
      kind: "leave",
      hasClubAdminTools: features.clubAdminTools,
    });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof ClubMembershipTransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not leave this club." }, { status: 500 });
  }
}
