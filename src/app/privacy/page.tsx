import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { publicPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Privacy Policy",
  description: "How Dropday collects, uses, shares, and protects information about members and playlist clubs.",
  path: "/privacy",
});

const sections = [
  { id: "scope", label: "Scope" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "how-we-use-information", label: "How we use information" },
  { id: "how-we-share-information", label: "How we share information" },
  { id: "club-visibility", label: "Club visibility" },
  { id: "cookies-and-storage", label: "Cookies and storage" },
  { id: "retention", label: "Retention" },
  { id: "security", label: "Security" },
  { id: "choices-and-rights", label: "Choices and rights" },
  { id: "children", label: "Children" },
  { id: "international", label: "International data" },
  { id: "changes-and-contact", label: "Changes and contact" },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy without the B-side"
      title="Privacy Policy"
      summary="This policy explains what information Dropday needs to run playlist clubs, how that information moves through the service, and the controls available to you."
      effectiveDate="July 30, 2026"
      sections={sections}
    >
      <section id="scope">
        <h2>1. Scope</h2>
        <p>This Privacy Policy applies to Dropday’s website, application, notifications, and related services. It does not cover Spotify, Apple Music, or other third-party services that you choose to open or use through Dropday.</p>
        <p>By using Dropday, you acknowledge the practices described here. Our <Link href="/terms">Terms of Use</Link> contain the rules for using the service.</p>
      </section>

      <section id="information-we-collect">
        <h2>2. Information we collect</h2>
        <h3>Account information</h3>
        <p>When you create or use an account, we receive information such as your name, email address, profile image, account identifier, plan, preferences, and account dates. Authentication is provided by Clerk; Dropday does not receive your password. If you purchase a plan, we receive subscription, plan, entitlement, and billing-event information needed to manage access. Payment-card details are handled by the billing provider rather than stored by Dropday.</p>

        <h3>Club and playlist information</h3>
        <p>We store the information needed to organize your clubs and drops, including club names and descriptions, public or private visibility, artwork, memberships and roles, join requests, queues, schedules, time zones, reminder settings, themes, backup playlists, playlist links and metadata, drop assignments, release dates, and publication history.</p>

        <h3>Content and interactions</h3>
        <p>We collect content you submit and actions you take, including playlist notes, club and theme descriptions, uploaded artwork, chat messages, mentions, reactions, notification read status, and membership or administration actions.</p>

        <h3>Communications and notification data</h3>
        <p>We keep your email-notification preferences and records needed to send or troubleshoot service messages. If you enable browser notifications, we store a push endpoint, encryption keys, expiration information, a user-agent string, and timestamps for that browser subscription. Your browser or device provider may also process a notification to deliver it.</p>

        <h3>Device and usage information</h3>
        <p>We and our infrastructure providers may receive standard technical information when you use Dropday, such as IP address, browser and device type, requested pages, referring page, timestamps, cookie or session identifiers, and diagnostic or security events. We also record limited operational events, such as webhook receipts, rate-limit records, and task or delivery status, to keep the service reliable and secure.</p>
      </section>

      <section id="how-we-use-information">
        <h2>3. How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>create and authenticate accounts and apply plan entitlements;</li>
          <li>operate clubs, rotations, schedules, themes, playlists, drops, chat, and discovery;</li>
          <li>deliver in-app, email, and browser notifications you have enabled;</li>
          <li>process payments and maintain subscription access;</li>
          <li>provide support and respond to questions or account requests;</li>
          <li>monitor performance, prevent abuse, investigate incidents, and protect members;</li>
          <li>debug, analyze, and improve Dropday’s features and usability; and</li>
          <li>comply with law, enforce our terms, and protect legal rights.</li>
        </ul>
        <p>Where applicable law requires a legal basis, we process information to provide the service you requested, pursue legitimate interests such as security and improvement, comply with legal obligations, or act with your consent.</p>
      </section>

      <section id="how-we-share-information">
        <h2>4. How we share information</h2>
        <p>We do not sell your personal information or share it for cross-context behavioral advertising. We may share information in these circumstances:</p>
        <ul>
          <li><strong>With other members.</strong> We show profile, club, playlist, drop, and interaction information to the people allowed to view the relevant club or feature.</li>
          <li><strong>With service providers.</strong> Vendors process information for us to provide authentication and billing, database and hosting, artwork storage, real-time chat, email, scheduled tasks, browser push, security, and technical operations.</li>
          <li><strong>With integrated music services.</strong> Opening or embedding a Spotify or Apple Music playlist sends standard request information to that provider under its own privacy policy.</li>
          <li><strong>For legal and safety reasons.</strong> We may disclose information when we reasonably believe it is required by law or needed to protect rights, safety, security, users, or the service.</li>
          <li><strong>During a business transaction.</strong> Information may transfer as part of a merger, financing, acquisition, reorganization, bankruptcy, or sale of assets, subject to appropriate protections.</li>
          <li><strong>With your direction.</strong> We may share information when you ask us to or give consent.</li>
        </ul>
        <p>Depending on which features are configured, service providers may include Clerk, MongoDB infrastructure, Ably, Resend, Trigger.dev, Vercel Blob, and browser or operating-system push services. They may process information only for the services they provide to us, subject to their own contractual and legal obligations.</p>
      </section>

      <section id="club-visibility">
        <h2>5. Club visibility and member content</h2>
        <p>Public clubs may be discoverable by Dropday members and may display club details intended for discovery. Private clubs and their content are limited to authorized members and administrators, subject to the controls shown in Dropday. Club owners and admins can see and manage information connected to their clubs, such as memberships, join requests, queues, and member-submitted content.</p>
        <p>Scheduled playlist content may stay limited to the assigned member or an authorized replacement until its release time. After publication, it becomes available to the relevant club members. Messages and reactions are visible to participants in their club or drop thread.</p>
        <p>Remember that another member may save or share information they can see. Choose what you post accordingly, and do not share sensitive personal information in club descriptions, playlist notes, or chat.</p>
      </section>

      <section id="cookies-and-storage">
        <h2>6. Cookies and local storage</h2>
        <p>Dropday and its authentication provider use cookies and similar storage to keep you signed in, protect sessions, remember interface state, and operate account features. Dropday also stores your light or dark appearance choice and visual skin preference in your browser’s local storage. A functional cookie may remember the application sidebar state.</p>
        <p>These technologies are used for service operation and preferences, not for third-party advertising. Blocking them may prevent sign-in or cause parts of Dropday to stop working as expected.</p>
      </section>

      <section id="retention">
        <h2>7. Data retention</h2>
        <p>We retain account and service information while your account is active and as needed to provide Dropday. The retention period depends on the type of information, why it was collected, whether a club or shared record still needs it, and legal, security, backup, dispute, and fraud-prevention requirements.</p>
        <p>When information is deleted, copies may remain temporarily in backups or logs before being removed through normal rotation. We may retain limited records longer when required by law or reasonably necessary to establish, exercise, or defend legal claims.</p>
      </section>

      <section id="security">
        <h2>8. Security</h2>
        <p>We use administrative, technical, and organizational safeguards designed to protect information, including authenticated access, authorization checks, limited integration credentials, and encrypted connections where supported. No online service can guarantee absolute security, so please use a strong account sign-in method and report suspected unauthorized access to us.</p>
      </section>

      <section id="choices-and-rights">
        <h2>9. Your choices and privacy rights</h2>
        <p>You can update many account and service preferences in Dropday. Settings let you control categories of email messages, browser notifications, theme, and visual skin. You can also change browser-notification permission in your browser or device settings. Essential account, security, billing, or service notices may still be sent when needed.</p>
        <p>Depending on where you live, you may have rights to access, correct, delete, or receive a copy of personal information; object to or restrict processing; or withdraw consent. You may also have the right to appeal a denied request or complain to a privacy regulator.</p>
        <p>To make a privacy or account-deletion request, email <a href="mailto:hello@dropday.app">hello@dropday.app</a> from the address connected to your account. We may need to verify your identity and authority before completing a request. Some information may be exempt from a request or retained where the law allows.</p>
      </section>

      <section id="children">
        <h2>10. Children</h2>
        <p>Dropday is not directed to children under 13, or under the minimum age required to consent to an online service where they live. We do not knowingly collect personal information from a child who cannot legally use the service. If you believe a child has provided information in violation of this policy, contact us so we can review and delete it as appropriate.</p>
      </section>

      <section id="international">
        <h2>11. International data</h2>
        <p>Dropday and its service providers may process information in countries other than the one where you live. Those countries may have different data-protection laws. Where required, we use recognized safeguards for international transfers and preserve any mandatory privacy rights available to you.</p>
      </section>

      <section id="changes-and-contact">
        <h2>12. Changes and contact</h2>
        <p>We may update this policy as Dropday, our providers, or privacy law changes. We will post the revised policy here and change the effective date. If an update materially affects how we use personal information, we will provide additional notice when reasonably possible.</p>
        <div className="legal-callout">
          <h3>Contact Dropday</h3>
          <p>Questions, requests, or concerns about privacy can be sent to <a href="mailto:hello@dropday.app">hello@dropday.app</a>.</p>
        </div>
      </section>
    </LegalPage>
  );
}
