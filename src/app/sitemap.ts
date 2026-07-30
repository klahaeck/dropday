import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteSiteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/pricing"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteSiteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteSiteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
