import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { ClerkPricing } from "@/components/clerk-ui";
import { getViewer } from "@/lib/auth";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Pricing" };

const plans = [
  { name: "Listener", accent: "var(--white)", price: "$0", club: "Join up to 3 clubs", features: ["Prepare unlimited playlists", "Club and drop chat", "In-app and email reminders"] },
  { name: "Selector", accent: "var(--plan-accent-selector)", price: "Live in Clerk", club: "Own 1 · join unlimited", features: ["Everything in Listener", "Full custom schedules", "Themes, backups, and admin tools"] },
  { name: "Resident", accent: "var(--green)", price: "Live in Clerk", club: "Own 5 · join unlimited", features: ["Everything in Selector", "Run multiple communities", "Ownership transfer and recovery"] },
  { name: "Resident Unlimited", accent: "var(--resident-unlimited-gradient)", price: "Live in Clerk", club: "Own unlimited · join unlimited", features: ["Everything in Resident", "No club ownership limit", "Ownership transfer and recovery"] },
];

export default async function PricingPage() {
  const viewer = await getViewer();
  const primaryHref = viewer ? "/app" : "/sign-up";

  return (
    <main className="marketing-shell">
      <header className="marketing-header">
        <Brand />
        <nav className="marketing-nav" aria-label="Marketing">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#features">Features</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className="header-actions">{viewer ? <Link href="/app" className="button button-dark button-small">Dashboard</Link> : <><Link href="/sign-in" className="button button-ghost button-small">Sign in</Link><Link href="/sign-up" className="button button-dark button-small">Join Dropday</Link></>}</div>
      </header>
      <section className="marketing-section" style={{ paddingTop: 70 }}>
        <div className="page-header"><div><span className="section-kicker">Simple entitlements</span><h1>Pay to host. Listen freely.</h1><p>Prices and billing periods are managed securely by Clerk. Any paid plan includes unlimited club memberships.</p></div></div>
        {integrations.clerk ? <ClerkPricing enabled /> : (
          <div className="pricing-grid">
            {plans.map((plan, index) => <article className={`panel pricing-card${index > 0 ? " pricing-card-accent" : ""}${plan.name === "Resident Unlimited" ? " pricing-card-unlimited" : ""}`} style={plan.name === "Resident Unlimited" ? undefined : { background: plan.accent }} key={plan.name}><span className="section-kicker">{plan.club}</span><h2 style={{ fontSize: 40 }}>{plan.name}</h2><p className="pricing-card-price">{plan.price}</p>{plan.features.map((feature) => <p key={feature}><Check size={15} style={{ display: "inline", marginRight: 7 }} /> {feature}</p>)}<Link href={primaryHref} className="button button-dark button-full">{viewer ? "Go to dashboard" : `Choose ${plan.name}`}</Link></article>)}
          </div>
        )}
      </section>
    </main>
  );
}
