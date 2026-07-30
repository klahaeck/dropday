import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <Brand />
      <div className="footer-links">
        <Link href="/pricing">Pricing</Link>
        <Link href="/app/discover">Discover</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="mailto:hello@dropday.app">Contact</a>
      </div>
      <span><ShieldCheck size={14} /> Built for music, not data mining.</span>
    </footer>
  );
}
