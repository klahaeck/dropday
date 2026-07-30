import type { Metadata } from "next";
import { env } from "@/lib/env";

export const SITE_NAME = "Dropday";
export const SITE_DESCRIPTION =
  "Create a playlist club, take turns dropping music, and make listening social again.";
export const SOCIAL_IMAGE_ALT =
  "Dropday — a playlist club with a proper rotation";
export const SOCIAL_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export function siteOrigin() {
  return new URL(env.appUrl).origin;
}

export function absoluteSiteUrl(path: string) {
  return new URL(path, `${siteOrigin()}/`).toString();
}

export function publicPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: `/${string}` | "/";
  absoluteTitle?: boolean;
}): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}

export const privateRouteMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};
