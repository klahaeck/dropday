import Link from "next/link";
import { BellRing, CreditCard, Mail, Palette, Shapes, ShieldCheck } from "lucide-react";
import { BrowserNotificationPreferences } from "@/components/browser-notifications";
import { EmailPreferences } from "@/components/email-preferences";
import { SkinSelector } from "@/components/skin-provider";
import { ThemeSelector } from "@/components/theme-provider";
import { requireViewer } from "@/lib/auth";
import { normalizeEmailPreferences } from "@/lib/email-preferences";
import { getMembershipEntitlement, getOwnershipEntitlement } from "@/lib/entitlements";
import { env, integrations } from "@/lib/env";
import { countActiveMemberships, countOwnedClubs } from "@/lib/repository";

export default async function SettingsPage() {
  const { profile, features, isDemo } = await requireViewer();
  const [memberships, owned] = await Promise.all([countActiveMemberships(profile.id), countOwnedClubs(profile.id)]);
  const memberEntitlement = getMembershipEntitlement(profile.plan, memberships, features.unlimitedMemberships);
  const ownership = getOwnershipEntitlement(profile.plan, owned);
  const browserPushConfigured = !isDemo
    && integrations.mongo
    && integrations.browserPush
    && Boolean(env.vapidPublicKey);
  return <><header className="page-header"><div><span className="section-kicker">Account and delivery</span><h1>Settings</h1><p>Control appearance, notification delivery, and understand exactly what your current plan allows.</p></div></header><div className="settings-grid"><article className="settings-card"><Palette /><h2>Appearance</h2><p>Follow your device automatically or keep Dropday in a fixed light or dark theme.</p><ThemeSelector /></article><article className="settings-card"><Shapes /><h2>Design</h2><p>Choose which visual design Dropday uses throughout the app. Sign-in and sign-up always use the classic Studio design.</p><SkinSelector /></article><article className="settings-card"><CreditCard /><h2>Plan and capacity</h2><p>Your <strong>{profile.plan}</strong> plan includes {memberEntitlement.joinLimit === null ? "unlimited memberships" : `${memberEntitlement.joinLimit} memberships`} and {ownership.ownedClubLimit === null ? "unlimited ownership" : `${ownership.ownedClubLimit} owned clubs`}.</p><div className="entitlement-meter"><span style={{ width: memberEntitlement.joinLimit ? `${Math.min(memberships / memberEntitlement.joinLimit * 100, 100)}%` : "12%" }} /></div><small>{memberships} active memberships · {owned} owned</small><br /><br /><Link href="/pricing" className="button button-dark button-small">Manage plan</Link></article><article className="settings-card"><BellRing /><h2>Browser notifications</h2><p>Receive every new account notification on this device, including assignments, mentions, reminders, and membership updates.</p><BrowserNotificationPreferences configured={browserPushConfigured} publicKey={env.vapidPublicKey} /></article><article className="settings-card"><Mail /><h2>Email delivery</h2><EmailPreferences initialPreferences={normalizeEmailPreferences(profile)} emailAddress={profile.primaryEmail} /></article><article className="settings-card"><ShieldCheck /><h2>Ownership safety</h2><p>A free account can never own a club. If a paid plan ends, clubs enter seven days of recoverable system custody before archival.</p></article></div></>;
}
