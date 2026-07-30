import type { MetadataRoute } from "next";
import { CLERK_FRONTEND_API_PROXY_PATH } from "@/lib/clerk-proxy";
import { absoluteSiteUrl, siteOrigin } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/app",
        "/sign-in",
        "/sign-up",
        `${CLERK_FRONTEND_API_PROXY_PATH}/`,
      ],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: siteOrigin(),
  };
}
