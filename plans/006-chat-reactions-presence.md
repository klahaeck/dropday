# Plan 006: Persist chat reactions and report presence truthfully

> **Executor instructions**: Follow every step and gate. Update plan 006 in `plans/README.md` when complete. Never trust reaction user IDs or access claims from the client.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/lib/chat-access.ts src/app/api/chat/route.ts src/app/api/ably/token/route.ts src/lib/chat-reaction-service.ts 'src/app/api/chat/messages/[messageId]/reaction/route.ts' src/lib/chat-reactions.ts src/lib/chat-messages.ts src/components/chat-panel.tsx src/lib/demo-data.ts src/types/domain.ts`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Reaction clicks currently change local React state only, so they disappear on refresh and can diverge across participants. When realtime is disabled, chat fabricates `4 here`; while connecting it assumes `1`. Persisted canonical reactions and explicit presence states make the room trustworthy without changing realtime vendors.

## Current state

- `chat-panel.tsx:61` initializes presence to `4` when realtime is off and `1` while connecting.
- `chat-panel.tsx:80-103` reads presence once but does not track enter/leave/failure.
- `chat-panel.tsx:213-220` updates reactions only in memory.
- `chat-reactions.ts:3-27` already defines one-reaction-per-user toggle semantics.
- `ChatMessage.reactions` is persisted with messages; chat and Ably routes duplicate access checks.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/chat-access.test.ts src/lib/chat-reaction-service.test.ts 'src/app/api/chat/messages/[messageId]/reaction/route.test.ts' src/lib/chat-reactions.test.ts src/lib/chat-messages.test.ts` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files; new tests beside new helpers/route; type change only if a reaction revision is required.

**Out of scope**: changing Ably provider/configuration, adding arbitrary emoji, message deletion/moderation, typing persistence, pricing/feature entitlements.

## Git workflow

Use the isolated branch. Commit as `Persist chat reactions and truthful presence`. Do not push or open a PR.

## Steps

### Step 1: Centralize thread authorization

Extract one server-only helper used by message creation, token issuance, and reaction mutation. It must enforce current feature access, club/drop visibility, active membership, and archived state consistently. Do not weaken existing checks.

**Verify**: helper tests cover club and drop threads, member/nonmember, hidden drop, and archived club.

### Step 2: Add a concurrency-safe reaction service and route

Export one allowed quick-reaction set. Create an authenticated endpoint accepting only `{ emoji }`; actor identity comes from `requireViewer`. Load and authorize the message, reject deleted/missing messages, toggle via the pure helper, and persist using a transaction plus CAS on the prior reactions or a dedicated revision with a small bounded retry. Never perform an unconditional read-then-write.

**Verify**: tests cover add, replace, remove, invalid emoji, access denial, missing/deleted message, CAS retry, and bounded 409 failure.

### Step 3: Publish canonical realtime updates

After persistence, publish a `reaction` event containing `{ messageId, reactions }`. A publish failure must not undo or report the successful database change as failed. Implement the same state mutation in demo mode.

**Verify**: service tests assert the event uses persisted canonical reactions and publish failure preserves success.

### Step 4: Reconcile optimistic reactions safely

Allow one pending reaction request per message. Optimistically apply the current user’s toggle, reconcile with HTTP or realtime canonical state, and on failure roll back only that user’s optimistic change while preserving reactions received from others. Subscribe idempotently to `reaction` events.

**Verify**: reducer/component tests cover success, remote update during request, duplicate event, and failure rollback preserving another user.

### Step 5: Replace fabricated presence with explicit states

Model `connecting`, `ready(count)`, and `unavailable`. Show a number only after successful `presence.get`. Subscribe to enter/leave/update and recompute. On failed/suspended/disconnected connection, clear the count. When realtime is disabled say `Live presence unavailable`; do not render a number. Clean up subscriptions, presence, and client on unmount.

**Verify**: state/reducer tests prove no numeric count exists before a successful snapshot or after failure.

### Step 6: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Reactions survive refresh and converge across clients.
- [ ] Concurrent updates cannot silently overwrite another user.
- [ ] Reaction actor/access is server-derived.
- [ ] Presence never displays an invented count.
- [ ] Realtime failure does not roll back persisted state.

## STOP conditions

- Persistence requires trusting client user IDs.
- The only implementation overwrites the full reaction array without CAS/revision protection.
- The endpoint needs broader Ably capabilities than chat already has.
- The solution requires a new realtime provider.

## Maintenance notes

Keep HTTP response and realtime event payloads identical so either can be canonical. Review concurrency and cleanup logic more heavily than visual details.
