# Plan 010: Preview and confirm schedule mutations

> **Executor instructions**: Follow every step and gate. Update plan 010 in `plans/README.md` when complete. Preview and commit must use the same pure planner and commit must revalidate concurrency inside the transaction.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/lib/club-schedule-change.ts src/lib/club-schedule-change.test.ts src/components/club-schedule-form.tsx 'src/app/api/clubs/[slug]/schedule/route.ts' src/components/interactive-forms.tsx 'src/app/api/clubs/[slug]/artwork/route.ts' 'src/app/app/clubs/[slug]/settings/page.tsx' src/app/globals.css src/app/skin-brutal.css`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/008-admin-action-safety.md, plans/009-club-creation-visibility.md
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Saving ordinary club details can also change the recurrence version, move the active scheduled drop, or turn an overdue drop back into scheduled. Those effects are not previewed and there is no stale-state token between what the admin sees and what commits. Separating schedule mutation makes the consequence explicit and concurrency-safe.

## Current state

- Identity, schedule, and reminders share one submit in `ClubSettingsForm` (`interactive-forms.tsx:657-866`).
- The PATCH route detects schedule/reminder changes and increments version (`api/clubs/[slug]/artwork/route.ts:91-113`).
- It can move scheduled/overdue active drops and reset overdue to scheduled (`:128-187`).
- There is no preview endpoint or expected schedule/drop token.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/club-schedule-change.test.ts 'src/app/api/clubs/[slug]/schedule/route.test.ts' src/lib/scheduling.test.ts src/lib/scheduler.test.ts` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files and new route/component tests.

**Out of scope**: changing recurrence policy/rrule semantics, adding pause/resume, altering queue order, pricing/custom-schedule entitlements, identity/visibility behavior from plan 009.

## Git workflow

Execute after plans 008 and 009. Commit as `Preview club schedule changes before commit`. Do not push or open a PR.

## Steps

### Step 1: Extract a pure schedule-change planner

Given current schedule, active drop, requested schedule/reminders, and current instant, return cadence/reminder deltas, old/new next-drop ISO values, active-drop status effect, current/next schedule version, and whether a new drop is needed. The planner must be the only source of preview text data and commit decisions.

**Verify**: tests cover unchanged, reminder-only, scheduled move, overdue reset, DST boundary, and missing future occurrence.

### Step 2: Add preview and commit route contracts

Create `POST /api/clubs/[slug]/schedule` for read-only preview and `PATCH` for mutation. Preview returns `expectedScheduleVersion` and nullable `expectedActiveDropId` with the exact effects. Commit requires those tokens plus `confirmed: true`; reject 409 if schedule version or active-drop identity/status/assignee changed.

**Verify**: route tests prove preview performs no writes and stale tokens cause 409 with no writes.

### Step 3: Move schedule mutation intact

Move transaction logic, active-drop rescheduling, trigger run cleanup, and task scheduling from the artwork route into the new route. Preserve existing atomicity, status rules, occurrence keys, warnings, and authorization. Reduce the old route to identity, visibility, accent, description, and artwork.

**Verify**: transaction-failure tests show club/drop unchanged; scheduler failure returns committed success plus warning; existing scheduling tests stay green.

### Step 4: Render a separate schedule form

Use plan 009’s timezone field. First submit requests preview. If anything changes, show old/new localized time, assignee, overdue reset, reminder additions/removals, and exact commit label in the plan-008 dialog. Reminder-only previews explicitly say the due time is unchanged. Only final confirm sends PATCH.

**Verify**: component tests prove preview cannot mutate, all effect variants render, Cancel preserves form state, and 409 requires a fresh preview.

### Step 5: Keep post-commit warnings visible

On success, update the form baseline/version and show Saved. If task scheduling returns a warning, keep it visible with retry/review guidance instead of clearing it during refresh.

**Verify**: warning and clean-success component tests pass.

### Step 6: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Identity save cannot mutate a schedule.
- [ ] Every schedule/reminder mutation is previewed by the same planner used for commit.
- [ ] Stale version/drop state fails closed with 409.
- [ ] Scheduled/overdue effects and reminder-only changes are stated explicitly.
- [ ] Existing transaction and scheduler-warning behavior remains intact.

## STOP conditions

- Preview and commit would use separate calculation logic.
- Commit can bypass confirmation or cannot CAS the active drop atomically.
- Moving logic weakens transaction boundaries or authorization.
- Current recurrence behavior must change to implement the split.

## Maintenance notes

Future pause/resume or cadence options must extend the planner first, then preview and commit. Review state-token checks and overdue behavior most closely.
