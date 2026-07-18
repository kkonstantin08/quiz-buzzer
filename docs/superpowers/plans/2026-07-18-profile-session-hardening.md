# Profile Session Hardening Implementation Plan

**Goal:** Secure profile email and password changes while revoking all other active sessions.

**Architecture:** Reuse the existing auth router, Prisma session validation, app event bus, Socket.IO lifecycle, and profile dialog. Normalize input at the auth boundary, commit sensitive changes and revocations together, then notify realtime only after commit.

**Tech Stack:** Express, Prisma/SQLite, bcrypt, express-rate-limit, Socket.IO, React, Vitest, Jest, Supertest.

## Global Constraints

- Keep registration available and leave legal, payments, uploads, game protocol, proxy, and Prisma schema unchanged unless tests prove a schema change is necessary.
- Store every new or changed email as lowercase after trimming; limit email to 254 characters and names to 80 characters.
- Preserve the current host session; revoke only other active sessions after successful email or password changes.
- Do not log or return passwords or hashes.
- Use TDD: every production change follows a focused failing test.

### Task 1: Auth input validation and profile update

**Files:**

- Modify: `apps/backend/src/auth/index.ts`
- Create: `apps/backend/src/auth/validation.ts`
- Test: `apps/backend/src/auth/__tests__/profile-security.test.ts`

- [ ] Write failing Supertest cases for email trimming/lowercasing, malformed and overlong email rejection, legacy-case login, name validation, and email password verification.
- [ ] Run `npm run test -w backend -- profile-security.test.ts` and verify each new assertion fails for the missing behavior.
- [ ] Add the smallest typed normalization helpers and route changes needed for those tests.
- [ ] Re-run the focused backend test and verify it passes.

### Task 2: Sensitive session revocation and rate limiting

**Files:**

- Modify: `apps/backend/src/auth/index.ts`
- Modify: `apps/backend/src/events.ts`
- Modify: `apps/backend/src/realtime/index.ts`
- Test: `apps/backend/src/auth/__tests__/profile-security.test.ts`
- Test: `apps/backend/src/realtime/__tests__/socket-session-auth.test.ts`

- [ ] Write failing tests for atomic revocation, current-session survival, revoked HTTP access, rollback, the password endpoint, and per-session/IP rate limiting.
- [ ] Write a failing Socket.IO test that proves revoked sockets disconnect without deleting the room while the current socket stays connected.
- [ ] Run the focused backend and Socket.IO suites and verify they fail for missing behavior.
- [ ] Add the transaction, typed post-commit event, dedicated limiter, and dedicated Socket.IO listener.
- [ ] Re-run the focused suites and verify they pass.

### Task 3: Profile client behavior

**Files:**

- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/components/DashboardLayout.tsx`
- Create: `apps/frontend/src/components/__tests__/DashboardLayout.profile.test.tsx`

- [ ] Write failing UI tests for conditional current-password rendering, no password sent for unchanged email, password-change validation, clearing fields, and success/error feedback.
- [ ] Run `npm run test -w frontend -- DashboardLayout.profile.test.tsx` and verify failure.
- [ ] Add only the API methods and profile-dialog controls needed for those tests.
- [ ] Re-run the focused frontend suite and verify it passes.

### Task 4: Verification and delivery

**Files:**

- Verify only; no unrelated files.

- [ ] Run focused auth/profile, session revocation, Socket.IO revocation, and frontend profile suites.
- [ ] Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run legal:check`, `npm run test:scripts`, `git diff --check`, and `docker compose config`.
- [ ] Inspect the complete diff against `main` and `git status --short` for generated artifacts.
- [ ] Commit the intended files and push `50-profile-session-hardening`; do not create a PR.
