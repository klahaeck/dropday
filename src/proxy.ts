import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { env, integrations } from "@/lib/env";
import {
  CLERK_FRONTEND_API_PROXY_PATH,
  shouldProxyClerkFrontendApi,
} from "@/lib/clerk-proxy";

const clerkProxy = clerkMiddleware({
  frontendApiProxy: {
    enabled: shouldProxyClerkFrontendApi(env.clerkPublishableKey),
    path: CLERK_FRONTEND_API_PROXY_PATH,
  },
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!integrations.clerk) return NextResponse.next();
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image|twitter-image|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/auth-runtime/(.*)",
  ],
};
