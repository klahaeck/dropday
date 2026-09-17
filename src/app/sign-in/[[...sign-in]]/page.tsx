import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ClerkSignIn } from "@/components/clerk-ui";
import { authentication } from "@/lib/env";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata: Metadata = privateRouteMetadata;

export default function SignInPage() {
  return <main className="auth-page"><section className="auth-story"><Brand /><h1>Back for the <em>next drop.</em></h1><p>There is always one more track to talk about.</p></section><section className="auth-panel">{authentication.mode === "clerk" ? <ClerkSignIn enabled /> : authentication.mode === "demo" ? <div className="demo-auth-card"><span className="pill pill-green">Demo mode</span><h2>Welcome back.</h2><p>Dropday is running with an isolated local demo profile.</p><Link href="/app" className="button button-dark button-full">Enter the demo</Link><p style={{ margin: "18px 0 0", fontSize: 12 }}>Add Clerk keys and disable demo mode in <code>.env.local</code> to enable production authentication.</p></div> : <div className="demo-auth-card"><h2>Sign-in is unavailable.</h2><p>Authentication is not configured. Add both Clerk keys, or explicitly enable isolated demo mode for local development.</p></div>}</section></main>;
}
