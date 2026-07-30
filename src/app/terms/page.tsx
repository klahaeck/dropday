import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { publicPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Terms of Use",
  description: "The terms that apply when you use Dropday and participate in a playlist club.",
  path: "/terms",
});

const sections = [
  { id: "using-dropday", label: "Using Dropday" },
  { id: "accounts", label: "Accounts" },
  { id: "clubs", label: "Clubs and roles" },
  { id: "your-content", label: "Your content" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "plans-and-billing", label: "Plans and billing" },
  { id: "third-party-services", label: "Third-party services" },
  { id: "service-changes", label: "Service changes" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Liability" },
  { id: "disputes", label: "Disputes" },
  { id: "changes-and-contact", label: "Changes and contact" },
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="The house rules"
      title="Terms of Use"
      summary="Dropday gives music fans a shared place to organize playlist clubs, take turns publishing drops, and talk about what they hear. These terms set the ground rules for using that service."
      effectiveDate="July 30, 2026"
      sections={sections}
    >
      <section id="using-dropday">
        <h2>1. Using Dropday</h2>
        <p>These Terms of Use (“Terms”) are an agreement between you and Dropday. By creating an account, joining a club, purchasing a plan, or otherwise using Dropday, you agree to these Terms and our <Link href="/privacy">Privacy Policy</Link>.</p>
        <p>You must be at least 13 years old, or the minimum age required in your country to consent to an online service. If you are not yet the age of legal majority where you live, a parent or legal guardian must approve your use of Dropday.</p>
        <p>If you use Dropday for an organization, you confirm that you have authority to accept these Terms for that organization.</p>
      </section>

      <section id="accounts">
        <h2>2. Accounts</h2>
        <p>Provide accurate account information and keep it current. You are responsible for activity under your account and for protecting access to it. Tell us promptly at <a href="mailto:hello@dropday.app">hello@dropday.app</a> if you believe your account has been compromised.</p>
        <p>You may not share credentials, impersonate another person, create accounts through unauthorized automated means, or transfer an account without our permission. We may ask you to verify account information when needed to protect Dropday or its members.</p>
      </section>

      <section id="clubs">
        <h2>3. Clubs, memberships, and roles</h2>
        <p>Dropday lets members create public or private clubs, manage a rotation and schedule, publish playlist drops, choose themes, keep backup playlists, and participate in club or drop chat.</p>
        <p>Club owners and admins can manage membership, scheduling, themes, queues, backups, and other club settings. Their decisions may affect your access to a club and its content. Public clubs may be discoverable by other Dropday members; private-club content is intended for authorized members, subject to the visibility controls shown in the service.</p>
        <p>A playlist scheduled for a future drop may be visible only to its assigned publisher or an authorized replacement until its release time. Do not try to bypass those controls or share unreleased club content without permission.</p>
      </section>

      <section id="your-content">
        <h2>4. Your content</h2>
        <p>You keep ownership of content you submit, such as club names and descriptions, playlist links and notes, themes, artwork, messages, and reactions (“Your Content”). You are responsible for Your Content and must have the rights needed to submit it.</p>
        <p>You give Dropday a worldwide, non-exclusive, royalty-free license to host, store, reproduce, format, display, and transmit Your Content only as needed to operate, secure, improve, and promote the service. This license is limited by the audience and privacy settings you choose. It ends when Your Content is deleted from our systems, except where a copy must be retained for legal, security, backup, or integrity purposes.</p>
        <p>Do not upload music files or artwork you do not have permission to use. Linking to or embedding a playlist does not transfer ownership of any music, recording, composition, artwork, or third-party service content to you or Dropday.</p>
        <p>Feedback and suggestions are voluntary. You allow us to use them without restriction or compensation.</p>
      </section>

      <section id="acceptable-use">
        <h2>5. Acceptable use</h2>
        <p>Use Dropday in a way that respects other members, creators, and the service. You may not:</p>
        <ul>
          <li>post unlawful, threatening, harassing, hateful, deceptive, sexually exploitative, or privacy-invasive content;</li>
          <li>infringe intellectual property, publicity, privacy, or other rights;</li>
          <li>send spam, malware, or unauthorized promotions, or scrape member information;</li>
          <li>probe, bypass, disrupt, overload, reverse engineer, or gain unauthorized access to the service or another account;</li>
          <li>use automated systems in a way that exceeds documented interfaces or interferes with ordinary use; or</li>
          <li>help anyone else do any of the above.</li>
        </ul>
        <p>We may remove content, limit features, suspend accounts, or preserve information when reasonably necessary to enforce these Terms, protect people or the service, investigate misuse, or comply with law. If you believe content infringes your rights, contact us with enough detail for us to review the request.</p>
      </section>

      <section id="plans-and-billing">
        <h2>6. Plans and billing</h2>
        <p>Dropday may offer free and paid plans. Current prices, included features, billing periods, and renewal terms are shown before purchase. Payments and subscription management are handled through our billing provider. You authorize the charges shown at checkout, including recurring charges until you cancel.</p>
        <p>You can cancel through the account or billing controls made available to you. Unless law requires otherwise, cancellation stops future renewals and does not refund charges already paid. Taxes may be added where required.</p>
        <p>When a paid plan ends or changes, club ownership limits and paid features may change. Affected clubs may enter a recovery period, become restricted, transfer to an eligible owner, or be archived as described in the service. We may change plans or prices prospectively and will provide notice when required.</p>
      </section>

      <section id="third-party-services">
        <h2>7. Third-party services</h2>
        <p>Dropday connects with or links to third-party services, including Spotify and Apple Music for playlist playback and Clerk for account and billing functions. Those services are operated under their own terms and privacy policies. Dropday does not control their availability, content, recommendations, subscriptions, or account decisions.</p>
        <p>You are responsible for any third-party account, device, data, or connectivity charges needed to use those services. Dropday is not affiliated with or endorsed by a music provider merely because its links or embeds appear in the service.</p>
      </section>

      <section id="service-changes">
        <h2>8. Service changes and termination</h2>
        <p>We may add, change, pause, or discontinue features to improve Dropday, address security or legal needs, or keep the service sustainable. We aim to give reasonable notice when a change materially reduces a paid feature, but urgent changes may take effect immediately.</p>
        <p>You may stop using Dropday at any time. You can request account deletion by emailing <a href="mailto:hello@dropday.app">hello@dropday.app</a>. We may suspend or terminate access if you materially or repeatedly violate these Terms, create risk for other members, or expose the service to legal or security harm.</p>
        <p>Sections that by their nature should continue after termination—including ownership, licenses needed for retained copies, disclaimers, liability limits, and dispute terms—will remain in effect.</p>
      </section>

      <section id="disclaimers">
        <h2>9. Disclaimers</h2>
        <p>Dropday is provided “as is” and “as available.” To the fullest extent permitted by law, we disclaim implied warranties, including merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation.</p>
        <p>We do not guarantee that a playlist, link, embed, notification, reminder, schedule, message, or third-party integration will always be available, accurate, delivered on time, or preserved. Keep your own copies of content that is important to you.</p>
        <p>Nothing in these Terms excludes warranties or consumer rights that cannot legally be excluded.</p>
      </section>

      <section id="liability">
        <h2>10. Limitation of liability</h2>
        <p>To the fullest extent permitted by law, Dropday and its operators, suppliers, and affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, goodwill, or opportunities arising from the service.</p>
        <p>To the fullest extent permitted by law, our total liability for all claims relating to Dropday will not exceed the greater of (a) the amount you paid Dropday in the 12 months before the event giving rise to the claim or (b) US $100.</p>
        <p>These limits do not apply where prohibited by law or to liability that cannot legally be limited.</p>
      </section>

      <section id="disputes">
        <h2>11. Disputes and applicable law</h2>
        <p>Before filing a formal claim, you and Dropday agree to try to resolve the issue informally. Send a description of the concern and the relief you seek to <a href="mailto:hello@dropday.app">hello@dropday.app</a>, and allow 30 days for a response.</p>
        <p>These Terms are governed by the laws that apply to Dropday’s operation and your use of the service, without overriding any mandatory consumer protections you have where you live. Any dispute must be brought in a court with lawful jurisdiction over the parties and the dispute.</p>
      </section>

      <section id="changes-and-contact">
        <h2>12. Changes and contact</h2>
        <p>We may update these Terms as Dropday changes. We will post the revised version here and update the effective date. If a change is material, we will provide additional notice when reasonably possible. Continuing to use Dropday after updated Terms take effect means you accept them.</p>
        <p>These Terms, together with policies or purchase terms they reference, are the entire agreement about your use of Dropday. If one part is unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver.</p>
        <div className="legal-callout">
          <h3>Contact Dropday</h3>
          <p>Questions about these Terms can be sent to <a href="mailto:hello@dropday.app">hello@dropday.app</a>.</p>
        </div>
      </section>
    </LegalPage>
  );
}
