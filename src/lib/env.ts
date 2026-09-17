const value = (key: string) => process.env[key]?.trim() || undefined;

export const env = {
  appUrl: value("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  demoMode: value("NEXT_PUBLIC_DEMO_MODE") === "true",
  mongoUri: value("MONGODB_URI"),
  mongoDb: value("MONGODB_DB") ?? "dropday",
  clerkPublishableKey: value("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: value("CLERK_SECRET_KEY"),
  clerkWebhookSecret: value("CLERK_WEBHOOK_SIGNING_SECRET"),
  clerkProxyUrl: value("NEXT_PUBLIC_CLERK_PROXY_URL"),
  ablyApiKey: value("ABLY_API_KEY"),
  ablyEnabled: value("NEXT_PUBLIC_ABLY_ENABLED") === "true",
  triggerSecretKey: value("TRIGGER_SECRET_KEY"),
  triggerProjectId: value("TRIGGER_PROJECT_ID"),
  resendApiKey: value("RESEND_API_KEY"),
  resendFrom: value("RESEND_FROM") ?? "Dropday <drops@example.com>",
  vapidPublicKey: value("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: value("VAPID_PRIVATE_KEY"),
  vapidSubject: value("VAPID_SUBJECT"),
};

export const integrations = {
  clerk: Boolean(env.clerkPublishableKey && env.clerkSecretKey),
  mongo: Boolean(env.mongoUri),
  ably: Boolean(env.ablyApiKey && env.ablyEnabled),
  trigger: Boolean(env.triggerSecretKey),
  resend: Boolean(env.resendApiKey),
  browserPush: Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject),
};

export type AuthenticationMode = "clerk" | "demo" | "unavailable" | "invalid";

export interface AuthenticationConfiguration {
  mode: AuthenticationMode;
  issues: string[];
}

export function resolveAuthenticationConfiguration({
  demoMode,
  mongoConfigured,
  clerkPublishableKey,
  clerkSecretKey,
  production = process.env.NODE_ENV === "production",
}: {
  demoMode: boolean;
  mongoConfigured: boolean;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  production?: boolean;
}): AuthenticationConfiguration {
  const hasPublishableKey = Boolean(clerkPublishableKey);
  const hasSecretKey = Boolean(clerkSecretKey);
  const clerkConfigured = hasPublishableKey && hasSecretKey;
  const issues: string[] = [];

  if (hasPublishableKey !== hasSecretKey) {
    issues.push("Both NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be configured together.");
  }
  if (!clerkConfigured && mongoConfigured) {
    issues.push("MONGODB_URI cannot be used without Clerk authentication.");
  }
  if (clerkConfigured && !mongoConfigured) {
    issues.push("Clerk authentication cannot be used without MONGODB_URI.");
  }
  if (demoMode && mongoConfigured && !clerkConfigured) {
    issues.push("Demo mode cannot use a persistent MongoDB database.");
  }
  if (demoMode && production && !clerkConfigured) {
    issues.push("Demo mode is disabled in production deployments.");
  }

  if (issues.length) return { mode: "invalid", issues };
  if (clerkConfigured) return { mode: "clerk", issues };
  if (demoMode) return { mode: "demo", issues };
  return { mode: "unavailable", issues };
}

export const authentication = resolveAuthenticationConfiguration({
  demoMode: env.demoMode,
  mongoConfigured: integrations.mongo,
  clerkPublishableKey: env.clerkPublishableKey,
  clerkSecretKey: env.clerkSecretKey,
});

export function assertValidAuthenticationConfiguration(): void {
  if (authentication.mode === "invalid") {
    throw new Error(`Invalid authentication configuration: ${authentication.issues.join(" ")}`);
  }
}
