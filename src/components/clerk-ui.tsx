"use client";

import type { ReactNode } from "react";
import type { SkinPreference } from "@/types/domain";
import { ClerkProvider, PricingTable, SignIn, SignUp, UserButton } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { useSkin } from "@/components/skin-provider";
import { useTheme } from "@/components/theme-provider";

// Clerk renders in its own shadow tree, so it cannot pick up the skin scoping in
// our stylesheets and has to be told which palette to use. Keyed by skin id, so
// typecheck fails until a newly registered design gets a palette here.
const clerkThemeVariables = {
  classic: {
    light: {
      colorNeutral: "#171713",
      colorPrimary: "#171713",
      colorPrimaryForeground: "#fffdf8",
      colorForeground: "#171713",
      colorMuted: "#e8e1d2",
      colorMutedForeground: "#6c685f",
      colorBackground: "#fffdf8",
      colorInput: "#f4f0e6",
      colorInputForeground: "#171713",
      colorBorder: "rgba(23, 23, 19, 0.16)",
    },
    dark: {
      colorNeutral: "#f4f0e6",
      colorPrimary: "#f4f0e6",
      colorPrimaryForeground: "#171713",
      colorForeground: "#f4f0e6",
      colorMuted: "#302f29",
      colorMutedForeground: "#aaa59b",
      colorBackground: "#23231f",
      colorInput: "#302f29",
      colorInputForeground: "#f4f0e6",
      colorBorder: "rgba(244, 240, 230, 0.16)",
    },
  },
  brutal: {
    light: {
      colorNeutral: "#12120f",
      colorPrimary: "#12120f",
      colorPrimaryForeground: "#f2f0e8",
      colorForeground: "#12120f",
      colorMuted: "#e2dfd2",
      colorMutedForeground: "#6b675c",
      colorBackground: "#fbfaf4",
      colorInput: "#fbfaf4",
      colorInputForeground: "#12120f",
      colorBorder: "rgba(18, 18, 15, 0.26)",
      colorRing: "#6c4dff",
      borderRadius: "0px",
      fontFamily: "var(--font-sans)",
    },
    dark: {
      colorNeutral: "#f2f0e8",
      colorPrimary: "#f2f0e8",
      colorPrimaryForeground: "#12120f",
      colorForeground: "#f2f0e8",
      colorMuted: "#1e1e19",
      colorMutedForeground: "#9c9990",
      colorBackground: "#171714",
      colorInput: "#171714",
      colorInputForeground: "#f2f0e8",
      colorBorder: "rgba(242, 240, 232, 0.2)",
      colorRing: "#d8fb4f",
      borderRadius: "0px",
      fontFamily: "var(--font-sans)",
    },
  },
  seventies: {
    light: {
      colorNeutral: "#3d2117",
      colorPrimary: "#a43d20",
      colorPrimaryForeground: "#fff8df",
      colorForeground: "#3d2117",
      colorMuted: "#ead5a8",
      colorMutedForeground: "#715040",
      colorBackground: "#fff8df",
      colorInput: "#fff8df",
      colorInputForeground: "#3d2117",
      colorBorder: "rgba(61, 33, 23, 0.3)",
      colorRing: "#2d716d",
      borderRadius: "18px",
      fontFamily: "Georgia, serif",
    },
    dark: {
      colorNeutral: "#f8e7be",
      colorPrimary: "#f2a65a",
      colorPrimaryForeground: "#24150f",
      colorForeground: "#f8e7be",
      colorMuted: "#422b1e",
      colorMutedForeground: "#cfb98e",
      colorBackground: "#332018",
      colorInput: "#332018",
      colorInputForeground: "#f8e7be",
      colorBorder: "rgba(248, 231, 190, 0.24)",
      colorRing: "#e7b638",
      borderRadius: "18px",
      fontFamily: "Georgia, serif",
    },
  },
  eighties: {
    light: {
      colorNeutral: "#170b30",
      colorPrimary: "#bd1676",
      colorPrimaryForeground: "#ffffff",
      colorForeground: "#170b30",
      colorMuted: "#e4daf8",
      colorMutedForeground: "#645676",
      colorBackground: "#ffffff",
      colorInput: "#ffffff",
      colorInputForeground: "#170b30",
      colorBorder: "rgba(50, 20, 82, 0.3)",
      colorRing: "#087f8f",
      borderRadius: "2px",
      fontFamily: "var(--font-mono)",
    },
    dark: {
      colorNeutral: "#f5efff",
      colorPrimary: "#ff3cac",
      colorPrimaryForeground: "#070312",
      colorForeground: "#f5efff",
      colorMuted: "#1d1037",
      colorMutedForeground: "#bfb1d0",
      colorBackground: "#120a25",
      colorInput: "#120a25",
      colorInputForeground: "#f5efff",
      colorBorder: "rgba(87, 232, 255, 0.3)",
      colorRing: "#57e8ff",
      borderRadius: "2px",
      fontFamily: "var(--font-mono)",
    },
  },
  metal: {
    light: {
      colorNeutral: "#171719",
      colorPrimary: "#a81920",
      colorPrimaryForeground: "#ffffff",
      colorForeground: "#171719",
      colorMuted: "#d8d6d0",
      colorMutedForeground: "#5f5d59",
      colorBackground: "#f1f0eb",
      colorInput: "#f8f7f2",
      colorInputForeground: "#171719",
      colorBorder: "rgba(23, 23, 25, 0.36)",
      colorRing: "#a81920",
      borderRadius: "2px",
      fontFamily: "var(--font-sans)",
    },
    dark: {
      colorNeutral: "#f0f0ec",
      colorPrimary: "#d5282f",
      colorPrimaryForeground: "#ffffff",
      colorForeground: "#f0f0ec",
      colorMuted: "#242428",
      colorMutedForeground: "#aaa9a4",
      colorBackground: "#111113",
      colorInput: "#111113",
      colorInputForeground: "#f0f0ec",
      colorBorder: "rgba(240, 240, 236, 0.26)",
      colorRing: "#e33a40",
      borderRadius: "2px",
      fontFamily: "var(--font-sans)",
    },
  },
  rap: {
    light: {
      colorNeutral: "#21142d",
      colorPrimary: "#603180",
      colorPrimaryForeground: "#ffffff",
      colorForeground: "#21142d",
      colorMuted: "#e4d5ad",
      colorMutedForeground: "#685872",
      colorBackground: "#fff8e9",
      colorInput: "#fff8e9",
      colorInputForeground: "#21142d",
      colorBorder: "rgba(64, 39, 75, 0.32)",
      colorRing: "#b18318",
      borderRadius: "10px",
      fontFamily: "var(--font-sans)",
    },
    dark: {
      colorNeutral: "#fff2cf",
      colorPrimary: "#e7b93e",
      colorPrimaryForeground: "#1a1022",
      colorForeground: "#fff2cf",
      colorMuted: "#2e1b38",
      colorMutedForeground: "#c4aecb",
      colorBackground: "#1c1025",
      colorInput: "#1c1025",
      colorInputForeground: "#fff2cf",
      colorBorder: "rgba(231, 185, 62, 0.34)",
      colorRing: "#e7b93e",
      borderRadius: "10px",
      fontFamily: "var(--font-sans)",
    },
  },
  classical: {
    light: {
      colorNeutral: "#2c2019",
      colorPrimary: "#752334",
      colorPrimaryForeground: "#fffaf0",
      colorForeground: "#2c2019",
      colorMuted: "#e8dfca",
      colorMutedForeground: "#6b5d51",
      colorBackground: "#fbf7ec",
      colorInput: "#fffaf0",
      colorInputForeground: "#2c2019",
      colorBorder: "rgba(70, 48, 37, 0.26)",
      colorRing: "#8c6d2c",
      borderRadius: "6px",
      fontFamily: "Georgia, serif",
    },
    dark: {
      colorNeutral: "#f4ead7",
      colorPrimary: "#c99b50",
      colorPrimaryForeground: "#1d1511",
      colorForeground: "#f4ead7",
      colorMuted: "#3b2e25",
      colorMutedForeground: "#c2b39d",
      colorBackground: "#221a16",
      colorInput: "#221a16",
      colorInputForeground: "#f4ead7",
      colorBorder: "rgba(244, 234, 215, 0.24)",
      colorRing: "#c99b50",
      borderRadius: "6px",
      fontFamily: "Georgia, serif",
    },
  },
} as const satisfies Record<SkinPreference, Record<"light" | "dark", Record<string, string>>>;

export function AuthProvider({
  enabled,
  publishableKey,
  children,
}: {
  enabled: boolean;
  publishableKey?: string;
  children: ReactNode;
}) {
  if (!enabled || !publishableKey) return children;
  return <ClerkThemeProvider publishableKey={publishableKey}>{children}</ClerkThemeProvider>;
}

function ClerkThemeProvider({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { skin } = useSkin();

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      ui={ui}
      appearance={{ variables: clerkThemeVariables[skin][resolvedTheme] }}
    >
      {children}
    </ClerkProvider>
  );
}

export function ClerkPricing({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <PricingTable
      for="user"
      appearance={{
        elements: {
          pricingTable: {
            "--grid-max-columns": "2",
          },
          pricingTableCard__free_user: "dropday-pricing-card dropday-pricing-card-listener",
          pricingTableCard__selector: "dropday-pricing-card dropday-pricing-card-selector",
          pricingTableCard__resident: "dropday-pricing-card dropday-pricing-card-resident",
          pricingTableCard__resident_unlimited: "dropday-pricing-card dropday-pricing-card-resident dropday-pricing-card-resident-unlimited",
        },
      }}
    />
  );
}

export function ClerkSignIn({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/app" />;
}

export function ClerkSignUp({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/app" />;
}

export function ClerkUserMenu({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <UserButton
      showName={false}
      appearance={{
        elements: {
          userButtonAvatarBox: {
            width: "40px",
            height: "40px",
          },
        },
      }}
    />
  );
}
