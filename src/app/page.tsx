import Link from "next/link";
import type { Metadata } from "next";
import { Fragment } from "react";
import { CalendarClock, MessageCircleMore, Palette, Repeat2, Sparkles } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Brand } from "@/components/brand";
import { MarketingFooter } from "@/components/marketing-footer";
import { getViewer } from "@/lib/auth";
import { demoUsers } from "@/lib/demo-data";
import { publicPageMetadata, SITE_DESCRIPTION } from "@/lib/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Dropday — playlists worth waiting for",
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

const marqueeItems = ["Spotify", "Apple Music", "One playlist at a time", "Real people, real rotation"];

export default async function MarketingHome() {
  const viewer = await getViewer();
  const primaryHref = viewer ? "/app" : "/sign-up";

  return (
    <main className="marketing-shell">
      <header className="marketing-header">
        <Brand />
        <nav className="marketing-nav" aria-label="Marketing">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
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

      <section className="hero">
        <div className="hero-copy">
          <h1>Music is better <em>in rotation.</em></h1>
          <p>Create a club, choose your drop day, and take turns sharing the playlists you cannot stop talking about.</p>
          <div className="hero-actions">
            <Link href={primaryHref} className="button button-orange">Start listening together</Link>
            <a href="#how-it-works" className="button button-ghost">See how it works</a>
          </div>
          <div className="hero-note">Free to join up to three clubs</div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="vinyl" />
          <div className="drop-ticket">
            <div className="ticket-label"><span>Tuesday drop · 09:00</span><span>07/21</span></div>
            <div className="ticket-art" />
            <span className="section-kicker">Needle Exchange presents</span>
            <h3>Sunburn after dark</h3>
            <p>Sticky drums, scorched guitars, and synths that refuse to cool down.</p>
            <div className="ticket-person"><Avatar user={demoUsers[0]} size="small" /> Dropped by Lena</div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <div className="marquee-group" key={copy}>
              {marqueeItems.map((item) => (
                <Fragment key={item}>
                  <span className="marquee-item">{item}</span>
                  <span className="marquee-separator">✦</span>
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="marketing-section" id="how-it-works">
        <div className="section-heading">
          <div><span className="section-kicker">A very good ritual</span><p>It takes three minutes to start and gives your group something worth looking forward to.</p></div>
          <h2>Make Tuesday mean something again.</h2>
        </div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">1</span><h3>Make a club</h3><p>Give it a name, set it public or private, and invite the friends whose queues you trust.</p></article>
          <article className="step-card"><span className="step-number">2</span><h3>Pick the drop day</h3><p>Choose any recurring rhythm, a local time, a theme, and the member rotation.</p></article>
          <article className="step-card"><span className="step-number">3</span><h3>Press play together</h3><p>A new playlist lands on schedule, complete with a dedicated room for the conversation.</p></article>
        </div>
      </section>

      <section className="marketing-section marketing-section-dark" id="features">
        <div className="section-inner feature-layout">
          <div className="feature-copy">
            <span className="section-kicker">Built for the group chat</span>
            <h2>The listening club, properly organized.</h2>
            <div className="feature-list">
              <div className="feature-row"><CalendarClock /><div><h3>Your cadence, your timezone</h3><p>Weekly, monthly, every other Friday, or several days in one rotation.</p></div></div>
              <div className="feature-row"><Repeat2 /><div><h3>A fair, visible queue</h3><p>Everyone knows who is next. Admins can reorder, pause, or call in a backup.</p></div></div>
              <div className="feature-row"><MessageCircleMore /><div><h3>Conversation where it belongs</h3><p>Club-wide chat and a dedicated room for every drop.</p></div></div>
              <div className="feature-row"><Palette /><div><h3>Themes that keep it interesting</h3><p>Give each round a prompt, from “rain at 2 a.m.” to “perfect first track.”</p></div></div>
            </div>
          </div>
          <div className="queue-demo">
            <div className="queue-demo-head"><div><span className="section-kicker">Needle Exchange</span><h3>Coming up</h3></div><span className="pill pill-green">Tuesdays</span></div>
            {demoUsers.map((user, index) => (
              <div className={`queue-item ${index === 0 ? "queue-item-active" : ""}`} key={user.id}>
                <span className="queue-index">0{index + 1}</span><Avatar user={user} /><div><strong>{user.displayName}</strong><small>{index === 0 ? "Dropping next" : `In ${index + 1} weeks`}</small></div><span>{index === 0 ? "Jul 21" : `Aug ${index * 7 + 1}`}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section pricing-preview">
        <div>
          <span className="section-kicker">Join free, host when ready</span>
          <h2>A plan for every size of record shelf.</h2>
          <p>Every paid plan unlocks unlimited club memberships. Your tier only determines how many clubs you can own.</p>
          <Link href="/pricing" className="button button-dark">See live pricing</Link>
        </div>
        <div className="price-stack">
          <div className="price-strip"><div><h3>Listener</h3><p>Join the rotation and prepare your drops.</p></div><span className="price-clubs">Join 3 clubs · free</span></div>
          <div className="price-strip"><div><h3>Selector</h3><p>Host your own tight-knit listening club.</p></div><span className="price-clubs">Own 1 club</span></div>
          <div className="price-strip"><div><h3>Resident</h3><p>Run a whole constellation of communities.</p></div><span className="price-clubs">Own 5 clubs</span></div>
          <div className="price-strip price-strip-unlimited"><div><h3>Resident Unlimited</h3><p>Host as many listening clubs as you want.</p></div><span className="price-clubs">Own unlimited clubs</span></div>
        </div>
      </section>

      <section className="marketing-cta">
        <Sparkles size={30} />
        <h2>Your next favorite song is probably in a friend’s playlist.</h2>
        <Link href={primaryHref} className="button button-cream">{viewer ? "Go to dashboard" : "Get in the rotation"}</Link>
      </section>

      <MarketingFooter />
    </main>
  );
}
