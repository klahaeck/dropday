import Link from "next/link";
import { CreditCard, Mail, Palette, ShieldCheck } from "lucide-react";
import { ThemeSelector } from "@/components/theme-provider";
import { requireViewer } from "@/lib/auth";
import { getMembershipEntitlement, getOwnershipEntitlement } from "@/lib/entitlements";
import { countActiveMemberships, countOwnedClubs } from "@/lib/repository";

export default async function SettingsPage() {
  const { profile, features } = await requireViewer();
  const [memberships, owned] = await Promise.all([countActiveMemberships(profile.id), countOwnedClubs(profile.id)]);
  const memberEntitlement = getMembershipEntitlement(profile.plan, memberships, features.unlimitedMemberships);
  const ownership = getOwnershipEntitlement(profile.plan, owned);
  return <><header className="page-header"><div><span className="section-kicker">Account and delivery</span><h1>Settings</h1><p>Control appearance, email delivery, and understand exactly what your current plan allows.</p></div></header><div className="settings-grid"><article className="settings-card"><Palette /><h2>Appearance</h2><p>Follow your device automatically or keep Dropday in a fixed light or dark theme.</p><ThemeSelector /></article><article className="settings-card"><CreditCard /><h2>Plan and capacity</h2><p>Your <strong>{profile.plan}</strong> plan includes {memberEntitlement.joinLimit === null ? "unlimited memberships" : `${memberEntitlement.joinLimit} memberships`} and {ownership.ownedClubLimit === null ? "unlimited ownership" : `${ownership.ownedClubLimit} owned clubs`}.</p><div className="entitlement-meter"><span style={{ width: memberEntitlement.joinLimit ? `${Math.min(memberships / memberEntitlement.joinLimit * 100, 100)}%` : "12%" }} /></div><small>{memberships} active memberships · {owned} owned</small><br /><br /><Link href="/pricing" className="button button-dark button-small">Manage plan</Link></article><article className="settings-card"><Mail /><h2>Email delivery</h2><p>Assignment, reminder, membership, and billing emails are currently <strong>{profile.emailNotifications ? "on" : "off"}</strong>.</p><button className="button button-ghost button-small">Change preferences</button></article><article className="settings-card"><ShieldCheck /><h2>Ownership safety</h2><p>A free account can never own a club. If a paid plan ends, clubs enter seven days of recoverable system custody before archival.</p></article></div></>;
}
