# Plan 005: Complete membership withdrawal, leave, and removal

> **Executor instructions**: Follow every step and verification gate. Update plan 005 in `plans/README.md` when complete. This plan supplies non-billing recovery paths; do not change membership limits or plan configuration.
>
> **Drift check (run first)**: `git diff --stat c97e7c0..HEAD -- src/types/domain.ts src/lib/club-membership-service.ts src/lib/join-request-service.ts 'src/app/api/join-requests/[requestId]/route.ts' 'src/app/api/clubs/[slug]/membership/route.ts' 'src/app/api/clubs/[slug]/members/[memberId]/route.ts' src/components/join-request-button.tsx src/components/membership-manager.tsx src/components/interactive-forms.tsx src/components/club-members.tsx src/app/app/clubs/page.tsx 'src/app/app/clubs/[slug]/page.tsx' 'src/app/app/clubs/[slug]/settings/members/page.tsx' src/app/globals.css`

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/003-playlist-language-validation.md, plans/004-safe-playlist-publication.md
- **Category**: direction
- **Planned at**: commit `c97e7c0`, 2026-09-17

## Why this matters

Users can request and gain membership but cannot withdraw a request, leave a club, or be removed through the UI. The membership-limit error therefore points to an action that does not exist. Completing the lifecycle must also preserve queue and active-drop invariants so an inactive person is never left responsible for the current turn.

## Current state

- `JoinRequestButton` posts only `{ clubId }` and turns a 402 into disabled `Upgrade or leave a club` (`interactive-forms.tsx:277-297`).
- Join-request PATCH supports only admin approve/decline; the domain has no `withdrawn` state.
- Membership status already supports `active`, `left`, and `removed` (`types/domain.ts:109-118`).
- Approval reactivates an inactive stable membership and restores rotation membership (`join-request-service.ts:38-83,221-239`).
- Member administration changes roles only; queue routes already demonstrate transaction/CAS patterns.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Service tests | `npm test -- src/lib/club-membership-service.test.ts src/lib/join-request-service.test.ts` | all pass |
| Route/component tests | `npm test -- 'src/app/api/join-requests/[requestId]/route.test.ts' 'src/app/api/clubs/[slug]/membership/route.test.ts' 'src/app/api/clubs/[slug]/members/[memberId]/route.test.ts' src/components/club-members.test.ts` | all pass |
| Full gate | `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` | exit 0 |

## Scope

**In scope**: files in the drift check; tests beside each new service/route; demo-mode mutations needed to mirror production; membership audit/notification writes using existing repository patterns.

**Out of scope**: `/pricing`, Clerk plans, entitlement counts/limits, billing service, auto-transferring ownership, deleting clubs, changing published drop history.

## Required policy

- A requester may withdraw only their own pending request; add `withdrawn` to `JoinRequest.status`.
- A member, admin, or non-primary co-owner may leave. The active primary owner must transfer ownership first.
- Admins may remove ordinary members. Owners may remove admins or ordinary members. No removal endpoint may remove an owner; demote/transfer first. Managers cannot remove themselves through the admin endpoint.
- Voluntary exit sets `left`; administrative exit sets `removed`. Both remove the user from `rotationMemberIds` and decrement `memberCount` exactly once.
- If the departing user owns the active scheduled/overdue turn, atomically reassign the same drop to the next eligible unpaused member and remove its attached playlist snapshot. Preserve drop ID, occurrence key, schedule version, scheduled time, and status. Reject 409 if no eligible replacement exists.

## Git workflow

Use the isolated branch after plans 003 and 004. Commit as `Complete club membership lifecycle`. Do not push or open a PR.

## Steps

### Step 1: Implement pending-request withdrawal

Add `withdrawn` to the type and extend the request route with authenticated `DELETE`. Check requester ownership and `pending` status, update atomically, and permit a later new request. Extract `JoinRequestButton` to its own component, pass pending request ID, add an optional 500-character message field, and show `Withdraw request` after submission.

**Verify**: request tests cover own/other user, pending/non-pending, repeated withdrawal, message persistence, and requesting again.

### Step 2: Build one membership transition service

Create a pure planner plus demo/Mongo executors for voluntary leave and administrative removal. The planner must enforce the policy above, calculate the next queue, determine active-drop reassignment and playlist detachment, and describe the audit/notification effects. Production execution must be transactional with CAS predicates on active membership, queue membership, custody owner, active-drop identity/status/assignee, and member count.

**Verify**: service tests cover member/admin/co-owner leave, primary-owner rejection, admin/owner removal matrix, last eligible member, scheduled and overdue reassignment, idempotent retry, and inactive-member reactivation.

### Step 3: Add self-leave and manager-removal routes

Create `DELETE /api/clubs/[slug]/membership` for the viewer and `DELETE /api/clubs/[slug]/members/[memberId]` for authorized managers. Return a structured outcome including redirect requirement and reassigned member when applicable. Write an audit event; notify administratively removed users. Do not expose a manager-supplied user ID for self-leave.

**Verify**: route tests assert 200/403/404/409 contracts and no partial writes on failure.

### Step 4: Replace the entitlement dead end with management UI

When the existing entitlement check blocks a join, show `Membership limit reached` and a `Manage memberships` link to `/app/clubs#manage-memberships`; preserve the existing limit unchanged. Add a management section listing active memberships, roles, active-turn consequences, and explicit leave confirmation. Primary owners receive transfer guidance instead of a leave control.

**Verify**: static component tests show correct controls for member, admin, non-primary owner, primary owner, and blocked join.

### Step 5: Add authorized removal controls

On the Members settings page, show `Remove member` only when the server-provided role relationship permits it. Confirmation must name the member and disclose active-turn reassignment/playlist detachment. On success, update local list/count and refresh; on 409, preserve the row and show recovery guidance.

**Verify**: `npm test -- src/components/club-members.test.ts` → visibility and response-state cases pass.

### Step 6: Run the complete gate

**Verify**: `npm run typecheck && npm run lint && npm test && npm run build && git diff --check` → exit 0.

## Done criteria

- [ ] Pending requests can be withdrawn and recreated.
- [ ] Eligible users can leave; authorized managers can remove non-owners.
- [ ] Primary owners cannot leave or be removed without transfer.
- [ ] No successful transition leaves an active drop assigned to an inactive member.
- [ ] Counts, queue, membership, drop, audit, and notification changes are atomic/idempotent.
- [ ] Blocked joins point to working membership management without changing plan limits.

## STOP conditions

- Product direction requires club deletion or automatic custody transfer when an owner leaves.
- Active-turn reassignment cannot be kept in the same transaction as membership/queue changes.
- Trigger jobs do not re-read the preserved drop and would require rescheduling semantics not covered here.
- The implementation would modify billing, plan limits, or published history.

## Maintenance notes

Review transaction predicates, last-member behavior, and idempotent retries most closely. Future invitation acceptance should reuse the same membership-reactivation contract.
