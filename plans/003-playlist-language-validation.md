# Plan 003: Make playlist language and validation consistent

> **Executor instructions**: Follow every step and gate. Update plan 003 in `plans/README.md` when complete. “Playlist” means the reusable library artifact; “drop” means the scheduled club event.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/app/app/page.tsx src/components/mobile-app-header.tsx src/app/app/library/page.tsx src/components/playlist-card.tsx src/components/playlist-library-table.tsx src/components/interactive-forms.tsx src/app/api/drafts/route.ts 'src/app/api/drafts/[draftId]/route.ts' src/lib/playlist-draft-validation.ts src/lib/playlist-draft-validation.test.ts src/app/globals.css`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-dashboard-temporal-truth.md
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

The product calls the same reusable object both a playlist and a drop, then sends validation errors to a single message below the form. That makes the creation flow harder to understand and errors easy to miss. A shared keyed-validation contract aligns client and server behavior while clarifying the product model.

## Current state

- Dashboard and mobile CTAs say `Prepare a drop` and link to `/app/library` (`page.tsx:48`, `mobile-app-header.tsx:160-162`).
- Library surfaces use `Prepared drop` and `reusable drop drafts` (`playlist-card.tsx:56`, `playlist-library-table.tsx:44`, library `page.tsx:29`).
- `DraftComposer` labels the artifact `Drop title` and renders a single shared error at the form bottom (`interactive-forms.tsx:357-443`).
- Draft routes return only `{ error }` for validation/provider failures.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/playlist-draft-validation.test.ts src/app/api/drafts/route.test.ts 'src/app/api/drafts/[draftId]/route.test.ts'` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: the files in the drift check, plus new route tests beside both draft routes.

**Out of scope**: provider integrations/metadata behavior, publication semantics, library persistence shape, pricing/plan gates, a new form framework.

## Git workflow

Execute after plan 001 because both change the dashboard header’s minified source line. Use the isolated branch and commit as `Clarify playlist creation and validation`. Do not push or open a PR.

## Steps

### Step 1: Create shared keyed validation

Add `playlist-draft-validation.ts` returning errors keyed by `title`, `spotifyUrl`, `appleMusicUrl`, and `description`. Reuse `normalizePlaylistUrl`; ensure each URL is for its labelled provider; require at least one provider; preserve current title/description/sanitized-HTML limits. Keep the helper client-safe—do not import database or server-only modules.

**Verify**: focused helper tests cover no URL, malformed URL, wrong provider in each field, one/two valid providers, title, and description bounds.

### Step 2: Return field identity from both routes

Use the shared contract in POST/PATCH routes and return `{ error, field }` for validation/provider failures without changing status codes, artwork cleanup, metadata fetching, or successful response shapes.

**Verify**: route tests cover keyed errors, successful create/update, and uploaded-artwork cleanup on rejection.

### Step 3: Put errors beside their controls

Replace the composer’s shared validation state with per-field errors plus one form/network error. Add `aria-invalid` and `aria-describedby`, focus the first invalid control, and clear only the error for the field the user changes. Keep the rich-text editor’s current focus behavior.

**Verify**: `rg -n 'aria-invalid|aria-describedby' src/components/interactive-forms.tsx` → the four fields are wired; typecheck passes.

### Step 4: Standardize product vocabulary and direct CTAs

Change reusable-artifact copy to `playlist`, including `Playlist title` and `Prepared playlist`. Reserve `drop` for scheduled events. Change dashboard and mobile creation CTAs to `Prepare a playlist` linking directly to `/app/library/new`. Preserve post-save destinations.

**Verify**: `rg -n 'Prepare a drop|Prepared drop|Drop title|reusable drop drafts' src/app/app src/components` → no matches in the in-scope user-facing surfaces.

### Step 5: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Client and routes share one field-keyed validation contract.
- [ ] Each invalid control owns its visible error and focus moves to the first failure.
- [ ] Reusable artifacts are called playlists; scheduled events remain drops.
- [ ] Creation CTAs deep-link to `/app/library/new`.
- [ ] Existing provider metadata and artwork behavior is unchanged.

## STOP conditions

- Shared validation requires importing server-only code into a Client Component.
- Field-level tests require adding a new DOM test dependency.
- Existing provider adapters cannot identify which input field failed without changing their public contract substantially.

## Maintenance notes

Use the same vocabulary for future library and attachment work. Review route cleanup paths carefully so a newly keyed validation error cannot leak an uploaded blob.
