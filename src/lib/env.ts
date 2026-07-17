const value = (key: string) => process.env[key]?.trim() || undefined;

export const env = {
  appUrl: value("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  demoMode: value("NEXT_PUBLIC_DEMO_MODE") !== "false",
  mongoUri: value("MONGODB_URI"),
  mongoDb: value("MONGODB_DB") ?? "dropday",
  clerkPublishableKey: value("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  clerkSecretKey: value("CLERK_SECRET_KEY"),
  clerkWebhookSecret: value("CLERK_WEBHOOK_SIGNING_SECRET"),
  ablyApiKey: value("ABLY_API_KEY"),
  ablyEnabled: value("NEXT_PUBLIC_ABLY_ENABLED") === "true",
  triggerSecretKey: value("TRIGGER_SECRET_KEY"),
  triggerProjectId: value("TRIGGER_PROJECT_ID"),
  resendApiKey: value("RESEND_API_KEY"),
  resendFrom: value("RESEND_FROM") ?? "Dropday <drops@example.com>",
};

export const integrations = {
  clerk: Boolean(env.clerkPublishableKey && env.clerkSecretKey),
  mongo: Boolean(env.mongoUri),
  ably: Boolean(env.ablyApiKey && env.ablyEnabled),
  trigger: Boolean(env.triggerSecretKey),
  resend: Boolean(env.resendApiKey),
};
