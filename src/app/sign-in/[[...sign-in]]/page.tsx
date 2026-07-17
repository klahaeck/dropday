import Link from "next/link";
import { Brand } from "@/components/brand";
import { ClerkSignIn } from "@/components/clerk-ui";
import { integrations } from "@/lib/env";

export default function SignInPage() {
  return <main className="auth-page"><section className="auth-story"><Brand /><h1>Back for the <em>next drop.</em></h1><p>There is always one more track to talk about.</p></section><section className="auth-panel">{integrations.clerk ? <ClerkSignIn enabled /> : <div className="demo-auth-card"><span className="pill pill-green">Demo mode</span><h2>Welcome back.</h2><p>Clerk is not configured yet, so Dropday will open with a local demo profile.</p><Link href="/app" className="button button-dark button-full">Enter the demo</Link><p style={{ margin: "18px 0 0", fontSize: 12 }}>Add Clerk keys in <code>.env.local</code> to enable production authentication.</p></div>}</section></main>;
}
