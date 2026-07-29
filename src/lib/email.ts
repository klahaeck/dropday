import { Resend } from "resend";
import { shouldSendDropdayEmail } from "@/lib/email-preferences";
import { env, integrations } from "@/lib/env";
import type { NotificationKind, UserProfile } from "@/types/domain";

export async function sendDropdayEmail({
  user,
  kind,
  subject,
  heading,
  body,
  href,
  idempotencyKey,
}: {
  user: Pick<UserProfile, "primaryEmail" | "emailNotifications" | "emailPreferences">;
  kind: NotificationKind;
  subject: string;
  heading: string;
  body: string;
  href?: string;
  idempotencyKey: string;
}) {
  if (!shouldSendDropdayEmail(user, kind)) {
    return { skipped: true, reason: user.primaryEmail ? "preference" : "missing-address" };
  }
  if (!integrations.resend) return { skipped: true };
  const resend = new Resend(env.resendApiKey);
  const button = href
    ? `<a href="${new URL(href, env.appUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#171713;color:#fffdf8;text-decoration:none;font-weight:700">Open Dropday</a>`
    : "";
  const result = await resend.emails.send(
    {
      from: env.resendFrom,
      to: user.primaryEmail,
      subject,
      html: `<div style="background:#f4f0e6;padding:36px;font-family:Arial,sans-serif;color:#171713"><div style="max-width:560px;margin:auto;background:#fffdf8;border:1px solid #171713;border-radius:20px;padding:32px"><p style="color:#ff5c35;text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:.1em">DROPday</p><h1 style="font-family:Georgia,serif;font-size:42px;line-height:1;margin:18px 0">${heading}</h1><p style="font-size:16px;line-height:1.6;color:#5f5b53">${body}</p>${button}</div></div>`,
    },
    { idempotencyKey },
  );
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
