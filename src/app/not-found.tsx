import Link from "next/link";
import { Disc3 } from "lucide-react";

export default function NotFound() {
  return <main className="auth-page"><section className="auth-story"><Disc3 size={40} /><h1>The needle missed the <em>groove.</em></h1><p>This club, playlist, or page is not available.</p></section><section className="auth-panel"><div className="demo-auth-card"><h2>Nothing dropped here.</h2><p>Head back to your dashboard and pick up the rotation from there.</p><Link href="/app" className="button button-dark button-full">Back to Dropday</Link></div></section></main>;
}
