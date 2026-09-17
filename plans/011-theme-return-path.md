# Plan 011: Return theme editing to the Themes tab

> **Executor instructions**: Follow the small scoped change exactly. Update plan 011 in `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- 'src/app/app/clubs/[slug]/themes/new/page.tsx' 'src/app/app/clubs/[slug]/themes/[version]/edit/page.tsx'`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Creating, editing, or cancelling a theme returns admins to general Settings rather than the Themes tab they came from. Two destination constants can restore workflow continuity without changing theme persistence.

## Current state

- New theme page sets `cancelHref = /app/clubs/${club.slug}/settings` at lines 22-25.
- Edit theme page sets the same destination at lines 35-38.
- `ClubThemeEditor` uses `cancelHref` for both successful save and Cancel (`interactive-forms.tsx:640,653`).
- The canonical Themes route is `/app/clubs/[slug]/settings/themes`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Static check | `rg 'cancelHref = .*settings/themes' src/app/app/clubs` | exactly 2 matches |
| Destination-count check | `rg -n 'const cancelHref' 'src/app/app/clubs/[slug]/themes'` | exactly 2 matches, the same two lines as the static check |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: the two theme page files in the drift check.

**Out of scope**: `ClubThemeEditor`, theme API routes, theme activation/deactivation, plan redirects, tab redesign, CSS.

## Git workflow

Use the isolated branch. Commit as `Return theme editor to Themes tab`. Do not push or open a PR.

## Steps

### Step 1: Correct both return destinations

Change both `cancelHref` values to `/app/clubs/${club.slug}/settings/themes`. Do not add query parameters or separate save/cancel paths.

**Verify**: `rg 'cancelHref = .*settings/themes' src/app/app/clubs` → exactly two matches.

### Step 2: Verify route compilation and behavior

Run the full gate. In a local session, verify New theme Cancel, New theme successful Save, Edit theme Cancel, and Edit theme successful Save all land on the Themes tab.

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Test plan

No new unit test is justified for two route constants. Build/typecheck plus four-path manual navigation is the proportional gate.

## Done criteria

- [ ] Both theme pages supply the Themes route.
- [ ] Save and Cancel continue to share the destination.
- [ ] Only the two in-scope files and index status changed.
- [ ] Full gate passes.

## STOP conditions

- A route-group/layout redirect overrides the supplied destination.
- The Themes route changes or is unavailable to the same authorized user.
- Fixing the destination requires touching plan or entitlement redirects.

## Maintenance notes

Keep create/edit return paths near the source page that launched them; avoid hard-coded general-settings fallbacks for tab-specific flows.
