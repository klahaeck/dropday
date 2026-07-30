import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { MarketingFooter } from "@/components/marketing-footer";
import { getViewer } from "@/lib/auth";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate: string;
  sections: ReadonlyArray<{ id: string; label: string }>;
  children: ReactNode;
}

export async function LegalPage({
  eyebrow,
  title,
  summary,
  effectiveDate,
  sections,
  children,
}: LegalPageProps) {
  const viewer = await getViewer();

  return (
    <main className="marketing-shell legal-shell">
      <header className="marketing-header">
        <Brand />
        <nav className="marketing-nav" aria-label="Marketing">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#features">Features</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className="header-actions">
          {viewer ? (
            <Link href="/app" className="button button-dark button-small">Dashboard</Link>
          ) : (
            <>
              <Link href="/sign-in" className="button button-ghost button-small">Sign in</Link>
              <Link href="/sign-up" className="button button-dark button-small">Join Dropday</Link>
            </>
          )}
        </div>
      </header>

      <div className="legal-page">
        <header className="legal-hero">
          <div>
            <span className="section-kicker">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="legal-hero-copy">
            <p>{summary}</p>
            <span className="legal-effective-date">Effective {effectiveDate}</span>
          </div>
        </header>

        <div className="legal-layout">
          <aside className="legal-toc">
            <strong>On this page</strong>
            <nav aria-label={`${title} sections`}>
              {sections.map((section) => (
                <a href={`#${section.id}`} key={section.id}>{section.label}</a>
              ))}
            </nav>
            <p>Questions? <a href="mailto:hello@dropday.app">hello@dropday.app</a></p>
          </aside>
          <article className="legal-document">{children}</article>
        </div>
      </div>

      <MarketingFooter />
    </main>
  );
}
