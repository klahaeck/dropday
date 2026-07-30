import type { MetadataRoute } from "next";
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
        "/__clerk/",
      ],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: siteOrigin(),
  };
}
