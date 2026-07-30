import { describe, expect, it } from "vitest";
import OpenGraphImage from "@/app/opengraph-image";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import TwitterImage from "@/app/twitter-image";
import { CLERK_FRONTEND_API_PROXY_PATH } from "@/lib/clerk-proxy";
import {
  publicPageMetadata,
  siteOrigin,
  SOCIAL_IMAGE_SIZE,
} from "@/lib/metadata";

async function pngDimensions(response: Response) {
  const bytes = await response.arrayBuffer();
  const view = new DataView(bytes);

  expect([...new Uint8Array(bytes.slice(0, 8))]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

describe("site metadata routes", () => {
  it("allows public pages while keeping authenticated and API routes private", () => {
    const output = robots();
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;

    expect(rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });
    expect(rules.disallow).toEqual(expect.arrayContaining([
      "/api/",
      "/app",
      "/sign-in",
      "/sign-up",
      `${CLERK_FRONTEND_API_PROXY_PATH}/`,
    ]));
    expect(output.sitemap).toBe(`${siteOrigin()}/sitemap.xml`);
  });

  it("lists only canonical public marketing and legal pages", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual([
      `${siteOrigin()}/`,
      `${siteOrigin()}/pricing`,
      `${siteOrigin()}/privacy`,
      `${siteOrigin()}/terms`,
    ]);
  });

  it("builds canonical Open Graph and large Twitter card metadata", () => {
    const metadata = publicPageMetadata({
      title: "Pricing",
      description: "Compare plans.",
      path: "/pricing",
    });

    expect(metadata.alternates).toEqual({ canonical: "/pricing" });
    expect(metadata.openGraph).toMatchObject({
      title: "Pricing · Dropday",
      url: "/pricing",
      siteName: "Dropday",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Pricing · Dropday",
    });
  });

  it("renders valid 1200 by 630 Open Graph and Twitter PNGs", async () => {
    const [openGraphDimensions, twitterDimensions] = await Promise.all([
      pngDimensions(OpenGraphImage()),
      pngDimensions(TwitterImage()),
    ]);

    expect(openGraphDimensions).toEqual(SOCIAL_IMAGE_SIZE);
    expect(twitterDimensions).toEqual(SOCIAL_IMAGE_SIZE);
  });
});
