import { describe, expect, it } from "vitest";
import { renderDropdayEmail, sendDropdayEmail } from "@/lib/email";
import { DEFAULT_EMAIL_PREFERENCES } from "@/lib/email-preferences";

describe("Dropday email delivery", () => {
  it("stops a disabled category before reaching the email integration", async () => {
    await expect(sendDropdayEmail({
      user: {
        primaryEmail: "member@example.com",
        emailNotifications: true,
        emailPreferences: {
          ...DEFAULT_EMAIL_PREFERENCES,
          reminders: false,
        },
      },
      kind: "reminder",
      subject: "Your drop is coming up",
      heading: "You’re almost up.",
      body: "Your playlist is due tomorrow.",
      idempotencyKey: "notification-reminder-1",
    })).resolves.toEqual({ skipped: true, reason: "preference" });
  });

  it("stops delivery when the profile has no email address", async () => {
    await expect(sendDropdayEmail({
      user: {
        emailNotifications: true,
        emailPreferences: DEFAULT_EMAIL_PREFERENCES,
      },
      kind: "published",
      subject: "A new playlist landed",
      heading: "Needle down.",
      body: "A new playlist is ready for the club.",
      idempotencyKey: "notification-published-1",
    })).resolves.toEqual({ skipped: true, reason: "missing-address" });
  });
});

describe("renderDropdayEmail", () => {
  it("escapes user-controlled notification copy and link attributes", () => {
    const html = renderDropdayEmail({
      heading: '<img src=x onerror="alert(1)">',
      body: "A & B's playlist",
      href: "/app/clubs/needle?source=mail&kind=drop",
    });

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("A &amp; B&#39;s playlist");
    expect(html).toContain("source=mail&amp;kind=drop");
    expect(html).not.toContain("<img src=x");
  });

  it("rejects non-web link protocols", () => {
    expect(() => renderDropdayEmail({ heading: "Hi", body: "There", href: "javascript:alert(1)" }))
      .toThrow("Email links must use HTTP or HTTPS");
  });

  it("rejects external web origins", () => {
    expect(() => renderDropdayEmail({ heading: "Hi", body: "There", href: "https://evil.example/phish" }))
      .toThrow("Email links must stay on the configured Dropday origin");
    expect(() => renderDropdayEmail({ heading: "Hi", body: "There", href: "//evil.example/phish" }))
      .toThrow("Email links must stay on the configured Dropday origin");
  });
});
