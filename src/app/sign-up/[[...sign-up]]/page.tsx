import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ClerkSignUp } from "@/components/clerk-ui";
import { authentication } from "@/lib/env";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata: Metadata = privateRouteMetadata;

export default function SignUpPage() {
  return <main className="auth-page"><section className="auth-story"><Brand /><h1>Find your place <em>in rotation.</em></h1><p>Join three clubs free. Upgrade only when you are ready to host.</p></section><section className="auth-panel">{authentication.mode === "clerk" ? <ClerkSignUp enabled /> : authentication.mode === "demo" ? <div className="demo-auth-card"><span className="pill pill-orange">Demo mode</span><h2>Take a look around.</h2><p>Dropday is running with an isolated local demo profile.</p><Link href="/app" className="button button-dark button-full">Enter the demo</Link></div> : <div className="demo-auth-card"><h2>Sign-up is unavailable.</h2><p>Authentication is not configured. Add both Clerk keys, or explicitly enable isolated demo mode for local development.</p></div>}</section></main>;
}
