import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Space_Mono } from "next/font/google";
import { AuthProvider } from "@/components/clerk-ui";
import { SkinProvider } from "@/components/skin-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_SKIN, SKIN_IDS, SKIN_STORAGE_KEY } from "@/lib/skin";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { env, integrations } from "@/lib/env";
import "./globals.css";
// Alternate designs share the complete opt-in component foundation in
// skin-brutal.css, then each skin layers its own scoped visual language.
import "./skin-brutal.css";
import "./skin-seventies.css";
import "./skin-eighties.css";
import "./skin-metal.css";
import "./skin-rap.css";

// Only opt-in skins render text in these families, so they are not preloaded:
// visitors on the default design would otherwise fetch faces they never use.
// Inter is deliberately not loaded here — the default design already asks for
// "Inter" by name, so self-hosting it would change how the default renders.
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", preload: false });
const monoFont = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap", preload: false });

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
    { media: "(prefers-color-scheme: light)", color: "#f2f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0b" },
  ],
};

const appearanceBootScript = `
  (function () {
    try {
      var root = document.documentElement;
      var preference = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      if (preference === "light" || preference === "dark") {
        root.setAttribute("data-theme", preference);
      } else {
        root.removeAttribute("data-theme");
      }
      var skin = localStorage.getItem(${JSON.stringify(SKIN_STORAGE_KEY)});
      var known = ${JSON.stringify(SKIN_IDS)};
      root.setAttribute("data-skin", known.indexOf(skin) === -1 ? ${JSON.stringify(DEFAULT_SKIN)} : skin);
    } catch (_) {}
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${monoFont.variable}`}
      data-skin={DEFAULT_SKIN}
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} /></head>
      <body>
        <ThemeProvider>
          <SkinProvider>
            <AuthProvider enabled={integrations.clerk} publishableKey={env.clerkPublishableKey}>
              {children}
            </AuthProvider>
          </SkinProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
