# Plan 009: Make club creation progressive and recoverable

> **Executor instructions**: Follow every step and gate. Update plan 009 in `plans/README.md` when complete. Reuse the confirmation dialog from plan 008 for in-app cancellation; browser `beforeunload` may use the native browser prompt.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/components/interactive-forms.tsx src/components/timezone-field.tsx src/components/use-unsaved-changes.ts src/lib/timezones.ts src/lib/timezones.test.ts src/lib/club-creation-flow.ts src/lib/club-creation-flow.test.ts src/app/api/clubs/route.ts 'src/app/api/clubs/[slug]/artwork/route.ts' 'src/app/app/clubs/[slug]/settings/page.tsx' src/app/globals.css src/app/skin-brutal.css`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/008-admin-action-safety.md
- **Category**: direction
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Club creation is one long form with a five-zone list, a public default, no cancel/dirty protection, and silent loss of a server partial-success warning. Visibility also cannot be edited later. A progressive form lowers initial cognitive load while preserving the existing single create transaction and makes recoverable outcomes explicit.

## Current state

- `interactive-forms.tsx:31-38` hard-codes five zones; `RitualFields` defaults to `America/Chicago` and uses a native select (`:131-164`).
- `CreateClubForm` is a monolithic three-section form and lists Public first (`:448-535`).
- The create route can return 201 plus a scheduler warning (`api/clubs/route.ts:119-128`), but the client response type omits `warning` and immediately redirects (`interactive-forms.tsx:512-520`).
- `Club.visibility` exists, but `ClubSettingsForm` and its PATCH schema do not expose it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/timezones.test.ts src/lib/club-creation-flow.test.ts src/app/api/clubs/route.test.ts 'src/app/api/clubs/[slug]/artwork/route.test.ts'` | all node-environment tests pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files; new route tests; pure creation-flow tests; stepper/timezone/dirty-state styles in both style foundations.

**Out of scope**: changing ownership eligibility, plan redirects/copy, schedule mutation semantics (plan 010), theme history, auto-saving drafts to the database, a global router blocker.

## Git workflow

Execute after plan 008. Commit as `Improve club creation and visibility controls`. Do not push or open a PR.

## Steps

### Step 1: Add an IANA timezone contract

Create a client-safe helper based on `Intl.supportedValuesOf("timeZone")` with a conservative fallback list. Deduplicate/sort, preserve a stored legacy value, and validate identifiers by constructing `Intl.DateTimeFormat`. Build a searchable combobox/listbox field that keeps the canonical zone ID as the form value.

**Verify**: tests cover browser/stored zones, dedupe/sort, fallback behavior, invalid zones, and preservation of a legacy valid zone.

### Step 2: Suggest the browser zone without overwriting intent

For new clubs only, after hydration suggest `Intl.DateTimeFormat().resolvedOptions().timeZone` before the user edits the field. Settings always preserve the stored zone. Validate on both create and settings routes; invalid values return 400 rather than a generic 500.

**Verify**: route tests cover valid/fallback/invalid zones and typecheck passes.

### Step 3: Split creation into three client-side steps

Keep one final form submission and all values mounted/preserved. Steps: (1) Identity—name, private-by-default visibility, description; (2) Ritual—date, time, timezone, cadence; (3) Optional finish—color, club artwork, optional initial theme. Extract pure step definitions, validation, and transitions to `src/lib/club-creation-flow.ts`; the Client Component owns focus and files. Validate only the visible step before Continue, focus the first invalid control, and show a labelled progress indicator plus Back/Continue controls.

**Verify**: pure tests assert the three steps, allowed transitions, step validation, and private default; a node-environment static render asserts the initial labelled step and one final Create control. Manually verify mounted values survive Back/Continue and focus moves to the first invalid control.

### Step 4: Add explicit cancellation and dirty protection

Add Cancel back to My Clubs. Use the plan-008 dialog when the form is dirty; leave immediately when pristine. Add a `beforeunload` guard for refresh/close and remove it after successful creation/unmount. Do not monkeypatch Next router or intercept unrelated links globally.

**Verify**: pure dirty-state tests cover pristine, changed, and success-disable decisions. In a local browser, verify dirty/pristine Cancel, refresh/close prompt, listener cleanup after success, and no prompt after unmount. Do not add jsdom/happy-dom solely for this plan.

### Step 5: Preserve partial-success truth

Parse `{ slug, warning }`. Normal success may redirect as today. On 201 plus warning, keep a `Club created` success panel with the exact warning and explicit `Open club` and `Review schedule` links; do not show a generic failure or resubmit. Ensure uploaded artwork is not discarded after the club exists.

**Verify**: route/client tests cover scheduler success, scheduler failure returning 201+warning, and no duplicate POST on recovery actions.

### Step 6: Make visibility editable later

Add current visibility with clear discoverability copy to Club Settings. Extend the authorized PATCH schema and update transaction to persist `public`/`private`; include it in the response. Do not change access-request or private-link behavior.

**Verify**: settings route tests accept both values, reject invalid values, and preserve unrelated fields.

### Step 7: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Creation has three understandable steps with one final transaction.
- [ ] Private is the explicit default and visibility remains editable.
- [ ] Timezones are searchable, canonical, suggested safely, and server-validated.
- [ ] Dirty cancellation/reload is guarded and cleanup is correct.
- [ ] 201+warning is presented as partial success with recovery links.

## STOP conditions

- Supporting IANA zones would require storing offsets instead of identifiers.
- Scheduler failure rolls back club creation rather than returning committed partial success.
- Dirty protection would require a global router monkeypatch.
- The change requires modifying pricing/ownership eligibility.

## Maintenance notes

Plan 010 will remove schedule mutation from the combined settings endpoint; do not deepen that coupling here. Review uploaded-artwork ownership/cleanup around partial success.
