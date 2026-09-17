# Plan 008: Safeguard consequential admin actions

> **Executor instructions**: Follow every step and gate. Update plan 008 in `plans/README.md` when complete. Plan 004 already handles backup-publication review; extend or reuse it, do not add a second competing confirmation.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/components/confirmation-dialog.tsx src/lib/admin-action-safety.ts src/components/club-backups.tsx src/components/club-members.tsx src/components/clear-current-theme-button.tsx src/components/club-themes-table.tsx src/lib/club-backups.ts 'src/app/api/clubs/[slug]/backups/[backupId]/route.ts' src/app/globals.css src/app/skin-brutal.css`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/004-safe-playlist-publication.md
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Backup removal, role demotion, ownership changes, and theme deactivation can commit with little or inconsistent warning. Some are reversible in domain terms but provide no undo. One shared, explicit confirmation pattern plus a narrow backup-restore path makes consequences visible without trying to reverse publication or queue history.

## Current state

- `club-backups.tsx:106-123` retires a backup immediately; retired backups have no restore path.
- `club-members.tsx:63-75` confirms ownership transfer only; demotions commit immediately.
- `clear-current-theme-button.tsx:12-21` uses native `window.confirm`; the route saves the former theme for later.
- `drop-attachment-form.tsx:59-105,203-263` is the existing focus trap, Escape, body-scroll-lock, and focus-restoration exemplar.
- Plan 004 makes backup publication review explicit; this plan must preserve that behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/components/confirmation-dialog.test.ts src/lib/admin-action-safety.test.ts src/lib/club-backups.test.ts 'src/app/api/clubs/[slug]/backups/[backupId]/route.test.ts' src/components/club-members.test.ts` | all node-environment tests pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files and new tests beside new helper/component/route.

**Out of scope**: reversing a published drop or queue movement, restoring used backups, changing role/custody policy, schedule changes, pricing/billing.

## Git workflow

Execute after plan 004. Commit as `Confirm and undo risky club admin actions`. Do not push or open a PR.

## Steps

### Step 1: Add one accessible confirmation dialog

Create a reusable controlled dialog with labelled title/description, explicit Cancel and commit labels, initial safe focus, focus trap, Escape cancellation, body scroll lock, and focus restoration. Follow the existing playlist-selector implementation rather than adding a dependency. Keep open/action state in pure helpers where useful; this repository’s Vitest environment is `node`, so do not assume jsdom.

**Verify**: node-environment static-render tests assert `role="dialog"`, `aria-modal`, labels, Cancel, and the exact commit label; pure helper tests cover action selection. In a local browser, open each dialog, verify initial safe focus, Tab/Shift+Tab containment, Escape cancellation, body-scroll restoration, and trigger focus restoration.

### Step 2: Centralize action summaries

Add pure helpers that identify downward role changes and generate consequence summaries. Promotions/no-ops remain confirmation-free. Transfer ownership and owner/admin demotion must state the resulting roles and lost permissions; freeform switch must state the current theme stays saved.

**Verify**: helper tests cover promotion, demotion, no-op, co-owner demotion, and primary ownership transfer.

### Step 3: Apply confirmations consistently

Replace native confirmation and immediate demotion calls with the shared dialog. Use it for ownership transfer, owner/admin demotion, freeform switch, and the final backup-publication commit created by plan 004 where compatible. Do not add a second review layer.

**Verify**: `rg -n 'window\.confirm' src/components` → no matches.

### Step 4: Make backup removal undoable

Add authorized/rate-limited `PATCH` restore behavior and service support. Permit only `retired → available`; reject used, already-available, cross-club, unauthorized, and duplicate-source cases with appropriate 4xx/409 responses. After removal, show a live-region message with Undo; if restore fails, preserve the retired UI state and show the error.

**Verify**: service/route tests cover every transition and authorization case; extracted pure state tests cover remove-success, undo-success, and undo-failure. Exercise the three states manually in a local browser; do not add a DOM dependency solely for this plan.

### Step 5: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Consequential admin commits use one explicit confirmation pattern.
- [ ] Promotions remain lightweight.
- [ ] Retired backups can be restored safely; used backups cannot.
- [ ] Plan 004’s publication semantics remain intact and non-duplicated.
- [ ] Native `window.confirm` is gone from app components.

## STOP conditions

- Undo would require reversing an already-published drop or queue mutation.
- Backup restore cannot prevent duplicate available snapshots transactionally.
- A role confirmation requires changing authorization or custody policy.
- Reusing plan 004’s review would create two final commits for one action.

## Maintenance notes

Use this dialog for future irreversible/reversible admin changes. Review focus restoration, exact action labels, and backup transition invariants closely.
