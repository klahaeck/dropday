import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { COMPLIMENTARY_PLAN_KEYS } from "@/lib/entitlements";

const schema = z.object({
  complimentaryPlan: z.enum(COMPLIMENTARY_PLAN_KEYS).nullable(),
});

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "status" in error
    && (error as { status?: unknown }).status === 404
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!viewer.isSuperAdmin) {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid complimentary plan." }, { status: 400 });
  }

  const { userId } = await params;
  if (!userId.trim()) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  try {
    const user = await (await clerkClient()).users.updateUserMetadata(userId, {
      privateMetadata: {
        complimentaryPlan: parsed.data.complimentaryPlan,
      },
    });

    return NextResponse.json({
      userId: user.id,
      complimentaryPlan: parsed.data.complimentaryPlan,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Clerk could not update this complimentary plan." },
      { status: 502 },
    );
  }
}
