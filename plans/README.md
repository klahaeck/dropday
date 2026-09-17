# Dropday UX Improvement Plans

Generated on 2026-09-17 from the live-product UX audit and source inspection at commit `c97e7c0`.
Execute in the order below unless the dependency column says a plan can run independently. Every executor must read its plan fully, run its drift check first, use Node `20.20.2`, follow the installed Next.js 16.3.0 documentation under `node_modules/next/dist/docs/`, and update its status row when done.

These plans intentionally exclude all pricing-plan work: do not change `/pricing`, Clerk pricing configuration, plan names or labels, entitlement limits or meters, billing services, checkout, or subscription behavior. A plan may preserve an existing entitlement check, but it must not redesign or reconfigure it.

The planning worktree is `/Users/khaeck/Sites/Thesion/dropday-worktrees/ux-improvements-plan` on branch `codex/dropday-ux-improvements`. The plans do not authorize a push, pull request, deployment, or live-account mutation.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Replace fabricated dashboard time data | P0 | M | — | DONE |
| 002 | Implement URL-backed Discover search | P0 | M | — | DONE |
| 003 | Make playlist language and validation consistent | P1 | M | 001 | DONE |
| 004 | Require review before playlist or backup publication | P0 | M | — | DONE |
| 005 | Complete membership withdrawal, leave, and removal | P0 | L | 003, 004 | DONE |
| 006 | Persist chat reactions and report presence truthfully | P0 | M | — | DONE |
| 007 | Add active navigation, route feedback, and first-run guidance | P1 | L | 001, 002, 003 | DONE |
| 008 | Safeguard consequential admin actions | P1 | M | 004 | DONE |
| 009 | Make club creation progressive and recoverable | P1 | L | 008 | DONE |
| 010 | Preview and confirm schedule mutations | P1 | L | 008, 009 | DONE |
| 011 | Return theme editing to the Themes tab | P2 | S | — | DONE |
| 012 | Make app layouts responsive to available width | P2 | L | 003–010 | DONE |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED — reason`, or `REJECTED — rationale`.

## Dependency notes

- 003 follows 001 because both edit the minified dashboard header line; it then precedes 005 and 007 because those plans also touch `interactive-forms.tsx` or the mobile playlist CTA.
- 004 precedes 005 because both alter the club page and active-drop controls.
- 008 builds on 004’s publication review and supplies the reusable confirmation dialog used by 009 and 010.
- 009 supplies the shared timezone field and separates club identity from schedule concerns before 010 extracts schedule mutation.
- 012 is last because it restructures CSS shared by almost every preceding flow; doing it earlier would create avoidable conflicts.
- 001, 002, 004, 006, and 011 can start independently in separate worktrees; coordinate their shared CSS edits, merge them in table order, and rerun the complete gate after each merge.

## Repository-wide verification baseline

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
git status --short
```

Expected: every command exits 0; `git status --short` lists only the files authorized by the active plan plus the executor’s status update in this index.

## Findings considered and rejected

- Pricing page, tier/plan labels, capacity meters, upsell/pricing copy, entitlement limits, and billing/provider configuration: explicitly excluded by the operator. Plan 005 may replace the broken membership-limit dead end with a link to membership management, but must not change the limit or introduce pricing work.
- A broad accessibility audit: explicitly deprioritized. The plans preserve focus, keyboard, dialog, and form-error fundamentals where those are intrinsic to the requested flows, but they do not attempt a standalone WCAG remediation.
- Replacing the visual identity: rejected. The audit found the current identity strong; the work should preserve each skin’s deliberate visual treatment.
- Replacing Ably or the database: rejected. The identified chat problems can be fixed within the existing persistence and realtime architecture.
