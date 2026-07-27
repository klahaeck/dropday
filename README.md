# Dropday

Dropday is a playlist-club application built with Next.js, MongoDB Atlas, Clerk, Ably, Trigger.dev, Resend, and Vercel Blob. Members take turns publishing Spotify or Apple Music playlists on a club-defined schedule.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app starts in demo mode when service credentials are absent. The brochure, dashboard, clubs, playlist library, queue, detail rooms, chats, and forms remain explorable with representative data. Appearance defaults to the system color scheme and can be fixed to light or dark from `/app/settings`; the preference is stored locally and synced to MongoDB for authenticated users.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Production services

Copy `.env.example` to `.env.local` and configure:

- `MONGODB_URI`: MongoDB Atlas connection string. Call `ensureIndexes()` from `src/lib/db.ts` once during environment provisioning.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: Clerk application credentials.
- `CLERK_WEBHOOK_SIGNING_SECRET`: webhook endpoint secret for `/api/webhooks/clerk`.
- `ABLY_API_KEY` and `NEXT_PUBLIC_ABLY_ENABLED=true`: authenticated club and drop channels.
- `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_ID`: delayed drop, reminder, outbox, and hourly custody tasks.
- `RESEND_API_KEY` and `RESEND_FROM`: transactional delivery from a verified domain.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`: native browser notifications for opted-in devices. Generate one persistent key pair with `npx web-push generate-vapid-keys`; use an HTTPS URL or `mailto:` address for the subject, and configure the same values for both the web deployment and Trigger.dev tasks.
- `BLOB_READ_WRITE_TOKEN`: a public Vercel Blob store used for optional playlist cover images.

Set `NEXT_PUBLIC_DEMO_MODE=false` after MongoDB and Clerk are configured.

Create and connect a public Blob store from the Vercel project’s Storage dashboard. Vercel adds `BLOB_READ_WRITE_TOKEN` to the selected deployment environments automatically; use `vercel env pull` when you need the token locally.

### Clerk Billing

Dropday uses Clerk **user plans**, not Organization plans. `Listener`, `Selector`,
and `Resident` are billing tier names. Club roles (`owner`, `admin`, and `member`)
remain app-local because they belong to a specific club rather than a Clerk
Organization.

Rename Clerk's default Free user plan to `Listener`, then create three paid user
plans with these stable keys:

| Clerk plan name | Clerk plan key | Memberships | Owned clubs |
| --- | --- | --- | --- |
| Listener | `free_user` | 3 | 0 |
| Selector | `selector` | Unlimited | 1 |
| Resident | `resident` | Unlimited | 5 |
| Resident Unlimited | `resident_unlimited` | Unlimited | Unlimited |

Create the following Clerk Features and attach them to the indicated plans. The
keys are part of the authorization contract and must match exactly.

| Feature name | Feature key | Listener | Selector | Resident | Resident Unlimited |
| --- | --- | :---: | :---: | :---: | :---: |
| Join up to 3 clubs | `three_club_memberships` | ✓ |  |  |  |
| Prepare unlimited playlists | `playlist_library` | ✓ | ✓ | ✓ | ✓ |
| Club and drop chat | `club_and_drop_chat` | ✓ | ✓ | ✓ | ✓ |
| In-app and email reminders | `in_app_and_email_reminders` | ✓ | ✓ | ✓ | ✓ |
| Unlimited club memberships | `unlimited_club_memberships` |  | ✓ | ✓ | ✓ |
| Own 1 club | `own_one_club` |  | ✓ |  |  |
| Own up to 5 clubs | `own_five_clubs` |  |  | ✓ |  |
| Own unlimited clubs | `own_unlimited_clubs` |  |  |  | ✓ |
| Full custom schedules | `custom_schedules` |  | ✓ | ✓ | ✓ |
| Club themes | `club_themes` |  | ✓ | ✓ | ✓ |
| Backup playlists | `backup_playlists` |  | ✓ | ✓ | ✓ |
| Club admin tools | `club_admin_tools` |  | ✓ | ✓ | ✓ |
| Ownership transfer | `ownership_transfer` |  |  | ✓ | ✓ |
| Ownership recovery | `ownership_recovery` |  |  | ✓ | ✓ |

The server enforces playlist, chat, hosting, schedule, theme, admin-tool, and
membership gates. Numeric ownership limits remain app policy derived from the
stable plan or ownership-feature keys. Prices, currencies, and billing periods
remain managed by Clerk and render through its pricing component.

Complimentary plans can be assigned from a user's server-only Clerk private
metadata. Set `complimentaryPlan` to one of the existing stable plan keys:

```json
{
  "complimentaryPlan": "resident"
}
```

Supported values are `free_user`, `selector`, `resident`, and
`resident_unlimited`. The effective plan is the higher of the user's billed
plan and complimentary plan, so private metadata cannot accidentally reduce an
existing subscription's access.

Subscribe the Clerk webhook to user lifecycle and subscription-item lifecycle events. The handler is idempotent and applies strict zero ownership when paid access ends: clubs enter system custody immediately, retain a seven-day recovery claimant, and archive without an active owner when the grace period expires.

### Trigger.dev

Initialize or connect the Trigger.dev project, then run:

```bash
npm run trigger:dev
npm run trigger:deploy
```

Tasks live in `src/trigger/dropday-tasks.ts`. Delayed runs always re-check the MongoDB slot status and schedule version, so cancelled, rescheduled, duplicated, or stale jobs cannot publish twice.

## Main architecture

- `src/types/domain.ts`: persistence and service contracts.
- `src/lib/entitlements.ts`: free and paid membership/ownership policy.
- `src/lib/scheduling.ts`: timezone-aware recurrence calculation and RRULE normalization.
- `src/lib/drop-service.ts`: transactional drop state machine, queue rotation, and outbox creation.
- `src/lib/billing-service.ts`: paid-plan transitions and system custody.
- `src/lib/playlist-providers.ts`: strict Spotify and Apple Music URL adapters.
- `src/app/api`: entitlement-gated mutation, chat, token, and webhook endpoints.
- `src/app/app`: all authenticated product routes.

MongoDB is the source of truth. Ably transports realtime events, Trigger.dev runs durable work, and email or browser delivery happens only after a notification has been persisted.
