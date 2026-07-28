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
