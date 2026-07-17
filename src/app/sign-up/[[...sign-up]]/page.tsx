import Link from "next/link";
import { Brand } from "@/components/brand";
import { ClerkSignUp } from "@/components/clerk-ui";
import { integrations } from "@/lib/env";

export default function SignUpPage() {
  return <main className="auth-page"><section className="auth-story"><Brand /><h1>Find your place <em>in rotation.</em></h1><p>Join three clubs free. Upgrade only when you are ready to host.</p></section><section className="auth-panel">{integrations.clerk ? <ClerkSignUp enabled /> : <div className="demo-auth-card"><span className="pill pill-orange">Demo mode</span><h2>Take a look around.</h2><p>The product is fully explorable before Clerk credentials are added.</p><Link href="/app" className="button button-dark button-full">Enter the demo</Link></div>}</section></main>;
}
