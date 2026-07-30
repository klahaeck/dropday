import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  signInProps: undefined as Record<string, unknown> | undefined,
  signUpProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: () => null,
  PricingTable: () => null,
  SignIn: (props: Record<string, unknown>) => {
    clerk.signInProps = props;
    return null;
  },
  SignUp: (props: Record<string, unknown>) => {
    clerk.signUpProps = props;
    return null;
  },
  UserButton: () => null,
}));

vi.mock("@clerk/ui", () => ({
  ui: {},
}));

import { ClerkSignIn, ClerkSignUp } from "@/components/clerk-ui";

const expectedClerkAuthAppearance = {
  elements: {
    formButtonPrimary: {
      color: "var(--on-solid)",
    },
    formFieldInput: {
      color: "var(--ink)",
      caretColor: "var(--ink)",
      borderColor: "color-mix(in srgb, var(--ink) 50%, transparent)",
      "&::placeholder": {
        color: "color-mix(in srgb, var(--ink) 72%, transparent)",
        opacity: "1",
      },
      "&:focus": {
        borderColor: "var(--ink)",
      },
    },
    socialButtonsIconButton: {
      borderColor: "color-mix(in srgb, var(--ink) 50%, transparent)",
    },
    headerSubtitle: {
      color: "color-mix(in srgb, var(--ink) 72%, transparent)",
    },
    dividerText: {
      color: "color-mix(in srgb, var(--ink) 72%, transparent)",
    },
    footerActionText: {
      color: "color-mix(in srgb, var(--ink) 72%, transparent)",
    },
  },
};

describe("Clerk authentication redirects", () => {
  beforeEach(() => {
    clerk.signInProps = undefined;
    clerk.signUpProps = undefined;
  });

  it("uses the dashboard only when sign-in has no requested destination", () => {
    renderToStaticMarkup(createElement(ClerkSignIn, { enabled: true }));

    expect(clerk.signInProps).toMatchObject({
      fallbackRedirectUrl: "/app",
      signUpUrl: "/sign-up",
      appearance: expectedClerkAuthAppearance,
    });
    expect(clerk.signInProps).not.toHaveProperty("forceRedirectUrl");
  });

  it("uses the dashboard only when sign-up has no requested destination", () => {
    renderToStaticMarkup(createElement(ClerkSignUp, { enabled: true }));

    expect(clerk.signUpProps).toMatchObject({
      fallbackRedirectUrl: "/app",
      signInUrl: "/sign-in",
      appearance: expectedClerkAuthAppearance,
    });
    expect(clerk.signUpProps).not.toHaveProperty("forceRedirectUrl");
  });
});
