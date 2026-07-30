import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const viewer = await getViewer();
        if (!viewer || viewer.isDemo) throw new Error("Sign in to upload artwork.");
        const pathMatch = pathname.match(/^artwork\/(playlist|club|theme)\/([^/]+)\/\d+\.jpg$/);
        if (!pathMatch || decodeURIComponent(pathMatch[2]) !== viewer.profile.id) throw new Error("Invalid artwork path.");
        const kind = pathMatch[1];
        const canUpload = kind === "playlist"
          ? viewer.features.playlistLibrary
          // Club and theme mutations perform the role-aware authorization.
          // Staging must also work for admins whose access comes from the club.
          : true;
        if (!canUpload) throw new Error("Your current plan does not include this artwork feature.");

        return {
          allowedContentTypes: ["image/jpeg"],
          maximumSizeInBytes: 2 * 1024 * 1024,
          addRandomSuffix: true,
          cacheControlMaxAge: 31_536_000,
          validUntil: Date.now() + 5 * 60 * 1000,
          tokenPayload: JSON.stringify({ kind, userId: viewer.profile.id }),
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload artwork." }, { status: 400 });
  }
}
