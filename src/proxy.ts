import { clerkMiddleware } from "@clerk/nextjs/server";
import { env } from "@/lib/env";
import {
  CLERK_FRONTEND_API_PROXY_PATH,
  shouldProxyClerkFrontendApi,
} from "@/lib/clerk-proxy";

export default clerkMiddleware({
  frontendApiProxy: {
    enabled: shouldProxyClerkFrontendApi(env.clerkPublishableKey),
    path: CLERK_FRONTEND_API_PROXY_PATH,
  },
});

export const config = {
  matcher: [
    "/((?!_next|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image|twitter-image|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/auth-runtime/(.*)",
  ],
};
