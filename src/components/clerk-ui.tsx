"use client";

import type { ReactNode } from "react";
import { ClerkProvider, PricingTable, SignIn, SignUp, UserButton } from "@clerk/nextjs";
import { useTheme } from "@/components/theme-provider";

const clerkThemeVariables = {
  light: {
    colorNeutral: "#171713",
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
    colorForeground: "#f4f0e6",
    colorMuted: "#302f29",
    colorMutedForeground: "#aaa59b",
    colorBackground: "#23231f",
    colorInput: "#302f29",
    colorInputForeground: "#f4f0e6",
    colorBorder: "rgba(244, 240, 230, 0.16)",
  },
} as const;

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

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{ variables: clerkThemeVariables[resolvedTheme] }}
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
