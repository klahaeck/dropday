import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/clerk-ui";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { env, integrations } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "Dropday — playlists worth waiting for", template: "%s · Dropday" },
  description: "Create a playlist club, take turns dropping music, and make listening social again.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64" },
      { url: "/dropday-mark.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Dropday",
    description: "A playlist club with a proper rotation.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#181815" },
  ],
};

const themeBootScript = `
  (function () {
    try {
      var preference = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      var root = document.documentElement;
      if (preference === "light" || preference === "dark") {
        root.setAttribute("data-theme", preference);
      } else {
        root.removeAttribute("data-theme");
      }
    } catch (_) {}
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>
        <ThemeProvider>
          <AuthProvider enabled={integrations.clerk} publishableKey={env.clerkPublishableKey}>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
