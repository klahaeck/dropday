import { Resend } from "resend";
import { env, integrations } from "@/lib/env";

export async function sendDropdayEmail({
  to,
  subject,
  heading,
  body,
  href,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  href?: string;
  idempotencyKey: string;
}) {
  if (!integrations.resend) return { skipped: true };
  const resend = new Resend(env.resendApiKey);
  const button = href
    ? `<a href="${new URL(href, env.appUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#171713;color:#fffdf8;text-decoration:none;font-weight:700">Open Dropday</a>`
    : "";
  const result = await resend.emails.send(
    {
      from: env.resendFrom,
      to,
      subject,
      html: `<div style="background:#f4f0e6;padding:36px;font-family:Arial,sans-serif;color:#171713"><div style="max-width:560px;margin:auto;background:#fffdf8;border:1px solid #171713;border-radius:20px;padding:32px"><p style="color:#ff5c35;text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:.1em">DROPday</p><h1 style="font-family:Georgia,serif;font-size:42px;line-height:1;margin:18px 0">${heading}</h1><p style="font-size:16px;line-height:1.6;color:#5f5b53">${body}</p>${button}</div></div>`,
    },
    { idempotencyKey },
  );
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
