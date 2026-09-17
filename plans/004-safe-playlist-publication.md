# Plan 004: Require review before playlist or backup publication

> **Executor instructions**: Follow every step and gate. Update plan 004 in `plans/README.md` when complete. The server, not preview state, must remain authoritative.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/components/drop-attachment-form.tsx 'src/app/app/clubs/[slug]/page.tsx' 'src/app/app/library/[playlistId]/page.tsx' src/lib/drop-attachment.ts 'src/app/api/drops/[dropId]/playlist/route.ts' src/lib/drop-attachment.test.ts src/components/club-backups.tsx 'src/app/api/clubs/[slug]/recover-drop/route.ts' src/lib/club-backups.test.ts src/app/globals.css`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Selecting a playlist currently commits immediately, and a late attachment can publish a drop, rotate the queue, and create the next drop without a review step. Backup recovery has the same immediate-publish shape. The fix is a select–review–commit contract protected by server-side stale-intent checks.

## Current state

- `drop-attachment-form.tsx:139-145,232-248` calls the API when an option is selected.
- `drop-attachment.ts:187-209` treats late attachment as publication plus queue rotation and next-drop creation.
- The route accepts only `{ draftId }`; it cannot verify what consequence the user reviewed.
- `club-backups.tsx:134-169,273-281` publishes recovery on the first form submit.
- Current-title display comes from props even after successful mutation, which can show stale text.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/drop-attachment.test.ts 'src/app/api/drops/[dropId]/playlist/route.test.ts' src/lib/club-backups.test.ts 'src/app/api/clubs/[slug]/recover-drop/route.test.ts'` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files; new route tests beside both mutation routes; only review-panel CSS in `globals.css`.

**Out of scope**: changing publication transactions, outbox/scheduler architecture, queue policy, playlist draft editing, general-purpose admin confirmation UI, pricing.

## Git workflow

Use the isolated branch. Commit as `Require review before publishing playlists`. Do not push or open a PR.

## Steps

### Step 1: Classify the authoritative consequence

Add a pure classifier in `drop-attachment.ts` returning `attach`, `replace`, `no-op`, or `publish-late` from the freshly loaded drop, current snapshot, requested draft, status, and server timestamp. Keep `publishDropInTransaction` as the only late-publication path.

**Verify**: tests cover new scheduled attachment, scheduled replacement, unchanged draft, overdue status, and scheduled time already passed.

### Step 2: Bind commit to reviewed state

Extend the request with `reviewedAction` and `expectedCurrentDraftId` (nullable). Inside the existing transaction, recompute the action and reject with 409 if the consequence or current attachment differs. Return the saved snapshot title/source ID and actual action. Apply an equivalent explicit `publish-backup` intent check to overdue recovery.

**Verify**: route/service tests prove stale action and stale draft ID cause 409 with no mutation; absent/wrong backup intent is rejected.

### Step 3: Implement select–review–commit in the attachment UI

Option clicks only update local selection and close the picker. Show a review panel naming club/drop, old playlist when present, selected playlist, schedule, and exact consequence. Final labels must be `Attach playlist`, `Replace playlist`, or `Publish late now and advance rotation`. If the server returns 409, refresh and require a fresh review.

**Verify**: component tests or extracted reducer tests prove option selection never calls fetch and final commit does.

### Step 4: Reconcile successful state

Update local current title/source ID from the successful response so `Currently attached` changes immediately. Preserve warning text, router refresh, and retry behavior.

**Verify**: the stale-title regression test passes.

### Step 5: Review backup recovery before publish

First submit opens a summary of backup title, overdue assignee/time, and whether the missed turn is kept or consumed. Only the explicitly labelled final commit sends the request.

**Verify**: backup tests cover both queue effects and confirm that preview does not mutate.

### Step 6: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Selection alone never calls a mutation endpoint.
- [ ] The server rejects a consequence or attachment that changed after review.
- [ ] Late publication remains atomic through `publishDropInTransaction`.
- [ ] Successful attachment updates visible current-playlist state.
- [ ] Backup recovery requires an explicit reviewed commit.

## STOP conditions

- The design would split publication and queue mutation across transactions.
- Confirmation exists only on the client without server intent/CAS checks.
- A step would bypass `publishDropInTransaction` or weaken existing authorization.
- The server cannot determine the current attached draft from the snapshot contract.

## Maintenance notes

Any future action that can cross from edit to publish should extend the same authoritative action classifier. Review 409 behavior and transaction boundaries most closely.
