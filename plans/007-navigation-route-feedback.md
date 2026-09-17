# Plan 007: Add active navigation, route feedback, and first-run guidance

> **Executor instructions**: Follow every step and gate. Update plan 007 in `plans/README.md` when complete. Read the installed Next.js docs for `loading.tsx`, `error.tsx`, `usePathname`, and `useLinkStatus` before editing.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/components/app-navigation-link.tsx src/lib/navigation.ts src/components/app-nav.tsx src/components/mobile-app-header.tsx src/app/app/loading.tsx src/app/app/error.tsx src/components/app-route-feedback.tsx src/components/app-empty-states.tsx src/app/app/page.tsx src/app/app/clubs/page.tsx src/components/notification-center.tsx src/app/globals.css src/app/skin-brutal.css`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-dashboard-temporal-truth.md, plans/002-discover-search.md, plans/003-playlist-language-validation.md
- **Category**: direction
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Primary navigation never indicates location, server navigations can appear inert, and a new account encounters blank grids instead of next steps. This plan makes navigation state explicit, gives slow routes immediate feedback, and turns zero-data states into useful product guidance without introducing pricing prompts.

## Current state

- Desktop and mobile map `appNavigationItems` without active state (`app-nav.tsx:42-55`, `mobile-app-header.tsx:148-157`).
- Classic CSS defines hover only; existing club-admin tabs demonstrate `aria-current="page"`.
- There is no `loading.tsx` or `error.tsx` below `src/app/app`.
- Dashboard assignment/clubs/activity, My Clubs, and Notification Center can render empty containers.
- `src/app/app/layout.tsx:19-23` reads auth, unread count, and cookies; installed docs warn that runtime reads in a layout can affect when segment loading UI appears.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npm test -- src/lib/navigation.test.ts src/components/app-route-feedback.test.ts src/components/app-empty-states.test.ts` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: files in the drift check and their new test files.

**Out of scope**: moving auth/cookie reads out of the app layout unless required and explicitly approved; global error page; pricing CTAs; changing data queries; a standalone accessibility audit.

## Git workflow

Execute after plans 001–003. Commit as `Improve app navigation and empty states`. Do not push or open a PR.

## Steps

### Step 1: Add a tested active-route matcher

`/app` is active only for the exact dashboard path. Other destinations are active for exact paths and descendants, with segment boundaries preventing `/app/clubhouse` from matching `/app/clubs`. Query strings must not affect state.

**Verify**: `npm test -- src/lib/navigation.test.ts` → every app destination and false-positive case passes.

### Step 2: Share an active/pending link wrapper

Create a Client Component using `usePathname` and set `aria-current="page"` plus active class. Put a descendant of each `Link` in charge of `useLinkStatus` pending feedback, as required by the installed API. Preserve desktop Sidebar composition/tooltips, unread badges, mobile menu close/focus behavior, Settings, and Super-admin links.

**Verify**: typecheck passes; static tests assert active/current and pending hooks are wired without duplicating nav definitions.

### Step 3: Add route loading and error states

Add `src/app/app/loading.tsx` with a lightweight stable shell skeleton and `role="status"`. Add `error.tsx` as a Client Component with neutral copy, Retry using the installed `retry()` API, and Back to dashboard. Log the error/digest only; never render raw server error text. Use `useLinkStatus` as immediate link feedback even when the route fallback is delayed.

**Verify**: static tests cover status copy, Retry, safe error rendering, and pending link content.

### Step 4: Add goal-oriented first-run states

Cover: dashboard with no clubs; clubs but no scheduled drop; no dashboard activity; My Clubs with no membership; no notifications. Use Discover, Prepare a playlist, New club, My clubs, or Dashboard CTAs as appropriate. Do not mention plan tiers or prices. Keep populated markup unchanged.

**Verify**: component tests cover each empty state and prove populated notifications omit empty copy.

### Step 5: Style all skins and run the complete gate

Add active, pending, skeleton, error, and empty-state styling to classic and generic non-classic foundations. Preserve derived-skin active treatments and reduced-motion behavior.

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Desktop/mobile/Settings/Super-admin navigation exposes current page.
- [ ] Slow navigation has immediate pending and route-level fallback feedback.
- [ ] Runtime errors show recoverable, non-sensitive UI.
- [ ] Every audited empty state gives an accurate explanation and useful next step.
- [ ] Existing populated states and mobile focus behavior remain intact.

## STOP conditions

- Installed docs/API differ from the plan’s `useLinkStatus` or `retry()` usage.
- Meaningful loading UI requires moving auth/runtime reads out of `app/layout.tsx`.
- Mobile menu focus trapping or close behavior regresses.
- Any CTA requires pricing, billing, or entitlement changes.

## Maintenance notes

Prefer route-level `loading.tsx` over permanent global spinners. New navigation destinations must extend the same boundary-safe matcher and include an intentional empty state.
