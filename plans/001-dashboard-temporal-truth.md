# Plan 001: Replace fabricated dashboard time data

> **Executor instructions**: Follow every step and verification gate. Update plan 001 in `plans/README.md` when complete. Do not touch pricing, billing, plan-label, or entitlement behavior.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/app/app/page.tsx src/lib/format.ts src/lib/format.test.ts src/components/dashboard-countdown.tsx src/components/dashboard-countdown.test.ts`
> If an in-scope file changed, compare the excerpts below with the live code. Any semantic mismatch is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

The dashboard currently presents a fixed date, greeting, countdown, and notification age as if they were live data. That makes the product’s primary schedule view untrustworthy. This plan makes every temporal claim derive from persisted ISO timestamps and an explicit club timezone while keeping the existing visual hierarchy.

## Current state

- `src/app/app/page.tsx:48` hard-codes `Thursday, July 16` and `Good afternoon`.
- `src/app/app/page.tsx:61` hard-codes `04`, `18`, and `32` in the countdown.
- `src/app/app/page.tsx:69` formats every activity row as `-1 day`, regardless of `createdAt`.
- `src/lib/format.ts:3-27` already uses Luxon for explicit-zone date/time and relative formatting.
- `DropSlot.scheduledFor` and `Notification.createdAt` are ISO strings in `src/types/domain.ts:194-207,237-246`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/format.test.ts src/components/dashboard-countdown.test.ts` | all tests pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Full gate | `npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**:

- `src/app/app/page.tsx`
- `src/lib/format.ts`
- `src/lib/format.test.ts` (create)
- `src/components/dashboard-countdown.tsx` (create)
- `src/components/dashboard-countdown.test.ts` (create)

**Out of scope**:

- Dashboard membership/ownership allowance cards and all entitlement logic.
- Persisting a user timezone or using browser-local time for club schedule claims.
- Changing drop scheduling, publication, or notification storage.

## Git workflow

- Work in the operator-provided isolated worktree/branch unless assigned a per-plan worktree.
- Commit as one logical unit with an imperative message such as `Show truthful dashboard timing`.
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Add deterministic time helpers

In `src/lib/format.ts`, add pure helpers that accept explicit instants: format the weekday/date in a supplied IANA timezone; choose morning/afternoon/evening from that same zoned instant; and compute non-negative days/hours/minutes from target minus now. Let `formatRelative` accept an optional base instant for consistent server rendering and tests. Invalid timestamps must return `null`, never fabricated text.

**Verify**: `npm test -- src/lib/format.test.ts` → tests cover timezone-boundary dates, greeting boundaries, multi-day carry, under-one-minute, exact due, past due, invalid ISO, and a notification older than one day.

### Step 2: Add a live countdown component

Create `DashboardCountdown` as a Client Component receiving `scheduledFor` and a server-supplied `nowIso`. Initialize from those values, refresh on a cleaned-up minute interval, render `Due now` at or below zero, and include a `<time dateTime={scheduledFor}>`. Avoid hydration drift by using the supplied initial instant rather than calling `Date.now()` during initial render.

**Verify**: `npm test -- src/components/dashboard-countdown.test.ts` → deterministic markup contains the computed values and target datetime.

### Step 3: Replace all fabricated dashboard values

Capture one `nowIso` in `DashboardPage`. Use the selected assignment club’s schedule timezone, with the existing `America/Chicago` convention only as a fallback when no club exists. Replace the fixed header, greeting, countdown, and activity age. Use `notification.createdAt` in `dateTime`; omit the visual time when parsing fails.

**Verify**: `rg -n 'Thursday, July 16|<strong>04</strong>|format\(-1, "day"\)' src/app/app/page.tsx` → no matches.

### Step 4: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Test plan

Model pure-helper tests after the existing Vitest tests in `src/lib/scheduling.test.ts`. Model static React rendering after existing component tests without adding a browser runner. Cover invalid input and due/past-due behavior as regressions, not only the happy path.

## Done criteria

- [ ] No fixed calendar date, greeting period, countdown number, or notification age remains on the dashboard.
- [ ] All temporal helpers accept controllable time inputs and their tests pass.
- [ ] Countdown never renders a negative unit and cleans up its timer.
- [ ] Full repository gate passes.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- Stored timestamps are not ISO instants.
- Product direction requires browser-local rather than club-timezone schedule display.
- A solution requires a new persisted user-timezone contract.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

Future relative-time or countdown UI should reuse these helpers so server and client claims stay consistent. Review hydration behavior and timezone-boundary tests closely.
