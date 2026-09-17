# Plan 012: Make app layouts responsive to available width

> **Executor instructions**: Execute last, after feature/form plans have landed. Run every gate and update plan 012 in `plans/README.md`. Preserve each skin’s visual identity; this plan owns shared geometry, not a redesign.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/app/app-structure.css src/app/layout.tsx src/app/globals.css src/app/skin-brutal.css src/app/skin-seventies.css src/app/skin-eighties.css src/app/skin-metal.css src/app/skin-rap.css src/app/app/page.tsx src/lib/responsive-css.test.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/003-playlist-language-validation.md through plans/010-schedule-preview.md
- **Category**: tech-debt
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

The app keeps a 250px sidebar while many grids reflow only from viewport breakpoints, so the usable content column can overflow well before mobile mode. Structural rules are duplicated between classic and non-classic foundations, and mobile hides useful dashboard actions/stats rather than adapting them. Moving shared geometry to one layer enables content-width-aware layouts without flattening the skins.

## Current state

- Sidebar/main geometry is at `globals.css:424-465` and `skin-brutal.css:475-515`.
- The 1100px viewport breakpoint stacks main grids, ignoring sidebar width (`globals.css:1063-1073`; `skin-brutal.css:1122-1132`).
- Mobile hides dashboard actions and stats (`globals.css:1120-1124`; `skin-brutal.css:1182-1186`).
- Fixed pressure points include 380px rails, a 210px attachment track, 240px member actions, and a chat minimum height of 540/forced 620px.
- `globals.css` and `skin-brutal.css` both own the same structural form/grid rules; derived skins should continue to own visual overrides only.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| CSS contract tests | `npm test -- src/lib/responsive-css.test.ts` | all pass |
| Forbidden rules | `rg 'dashboard-page-actions.*display: none|dashboard-stats-grid.*display: none' src/app` | no matches |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: drift-check files. Touch derived skin files only when a targeted visual override is required after shared-geometry extraction. `page.tsx` may receive semantic wrapper/classes only.

**Out of scope**: pricing page/layout, typography/color/radius/shadow redesign, marketing pages, new breakpoints unsupported by browser targets, unrelated accessibility cleanup.

## Git workflow

Execute only after plans 003–010 are integrated. Commit as `Make app layouts responsive to content width`. Do not push or open a PR.

## Steps

### Step 1: Record the structural baseline

Before editing, confirm the known duplication and hidden-dashboard rules so later checks have an exact baseline. Do not add a deliberately failing test.

**Verify**: `rg -c 'dashboard-page-actions.*display: none|dashboard-stats-grid.*display: none' src/app/globals.css src/app/skin-brutal.css` → reports `2` for each file; `rg -n 'grid-template-columns: minmax\(0, 1fr\) 380px' src/app/globals.css src/app/skin-brutal.css` → reports the duplicated club/drop rail rules.

### Step 2: Extract shared geometry

Create `app-structure.css` and import it after skin files from `src/app/layout.tsx`. Define skin-overridable sidebar width variables. Move only structure—display, grid/flex tracks, min/max width, overflow containment, container setup, and responsive reflow. Keep colors, borders, radii, shadows, typography, and intentional spacing in the style foundations. Add ownership comments to prevent re-duplication. Now add `responsive-css.test.ts` to assert shared target selectors live in this file, dashboard actions/stats are not hidden, the mobile switch remains 800px, and duplicate structural declarations are absent from both foundations.

**Verify**: `npm test -- src/lib/responsive-css.test.ts` → structural-location assertions pass.

### Step 3: Reflow by app-main width

Make `.app-main` a named inline-size container. Use container queries for dashboard, club/drop layouts, cards, forms, settings, members, and chat so expanded/collapsed sidebar width is reflected. Use `minmax(0, 1fr)` and `min-width: 0` on grid children, date/time controls, rich-text editors, action groups, and attachment forms.

**Verify**: CSS contract tests confirm container declaration and targeted selectors; build passes.

### Step 4: Preserve useful content at narrow widths

Keep dashboard actions visible and wrapping. Keep stats at two columns for compact widths and one column only for phones. Stack the 380px rail before it crowds content. Let form actions wrap/stack; reflow member actions before 520px. Replace forced chat height with `100dvh`-aware max/min behavior and a lower phone minimum. Preserve the viewport-based 800px switch between sidebar and mobile header.

**Verify**: forbidden-rule grep has no matches; focused CSS tests pass.

### Step 5: Verify skins and viewport matrix

Run locally and inspect 1440, 1280, 1100, 900, 800, 520, and 390px, with expanded/collapsed sidebar where applicable. Check dashboard, create club, club room/chat, schedule settings, Members, Themes, and Backups in Studio, Raw, and one derived skin. At each size, `document.documentElement.scrollWidth === document.documentElement.clientWidth` must be true.

**Verify**: in browser console at each viewport, `document.documentElement.scrollWidth === document.documentElement.clientWidth` → `true`; record the matrix in the commit/PR notes.

### Step 6: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Shared structural rules have one owner and skin visuals remain separate.
- [ ] Reflow responds to available main-column width.
- [ ] Dashboard actions/stats remain available on mobile.
- [ ] No horizontal page overflow occurs in the required viewport/surface matrix.
- [ ] The 800px sidebar/mobile-header switch remains intentional.
- [ ] Full gate and CSS contract tests pass.

## STOP conditions

- Container queries are outside the project’s supported browser target.
- Extracting a declaration changes an intentional skin treatment and cannot be isolated with a variable/override.
- Responsive fixes require touching the pricing page.
- A feature plan has not landed and its final markup is still unstable.

## Maintenance notes

New components should place geometry in `app-structure.css` and visual skin treatment in the appropriate foundation. Review at 900–1100px most closely; that is where sidebar-reduced content width currently fails.
