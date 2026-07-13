# AGENTS.md

## Purpose

This file defines repository-specific rules for coding agents working on Quiz Buzzer. It complements `README.md`, issues, tests, and human review.

## Project context

Quiz Buzzer is a real-time quiz application. A host creates a room, participants join from separate devices, and the backend determines who buzzed first while accounting for latency, clock offset, disconnects, reconnects, and stale timers.

Repository structure:

- `apps/frontend` — React, Vite, TypeScript, Socket.IO Client, PWA.
- `apps/backend` — Express, Socket.IO, Prisma, SQLite, JWT sessions.
- `packages/shared` — shared event contracts, public types, Zod schemas.
- `tests` — Playwright accessibility and keyboard tests.
- `.github/workflows/ci.yml` — required CI checks.
- `docker-compose.yml` — production-style deployment through nginx.

Use Node.js 22.

## Essential commands

Run from the repository root.

- Clean install: `npm ci`
- Install while intentionally updating the lockfile: `npm install`
- Start development: `npm run dev`
- Build shared: `npm run build -w shared`
- Generate Prisma Client: `npm run db:generate -w backend`
- Apply migrations: `npm run db:migrate -w backend`
- Lint: `npm run lint`
- Type-check: `npm run typecheck`
- Test: `npm run test`
- Build: `npm run build`
- Full local CI: `npm run ci`
- Backend tests: `npm run test -w backend`
- Frontend tests: `npm run test -w frontend`
- Playwright tests: `npx playwright test`
- Diff check: `git diff --check`

Docker smoke check:

```bash
docker compose build
docker compose up -d
curl --fail http://localhost/api/health
docker compose ps
docker compose down --remove-orphans
```

Do not run `docker compose down -v` without explicit approval because it deletes persistent database and upload volumes.

## Before editing

1. Read the linked issue, `README.md`, relevant package scripts, and existing tests.
2. Run:

```bash
git status
git branch --show-current
git log --oneline -10
```

3. Confirm the branch is not `main`.
4. Preserve unrelated user changes.
5. Explain the root cause, planned changes, and verification steps.
6. For multi-step work, split implementation into iterations.
7. Before each new iteration, explain the intended change and wait for human approval.

## Scope and implementation

- Keep changes limited to the linked issue or explicit request.
- Prefer the smallest complete solution.
- Avoid unrelated refactoring, speculative features, and unnecessary abstractions.
- Preserve existing behavior unless the issue requires changing it.
- Match existing project structure and naming.
- Report unrelated defects instead of fixing them silently.
- Do not weaken tests, validation, typing, authorization, or CI to make checks pass.
- After the same failure occurs twice, investigate the root cause before trying another fix.

## Issue, branch, commit, and PR rules

- Use an existing issue when the task already belongs to one.
- Do not create duplicate issues.
- Create an issue before non-trivial new work.
- Use `.github/ISSUE_TEMPLATE/` when available.
- Branch format: `<issue-number>-short-description`.
- Never implement directly on `main`.
- Keep commits focused and use concise imperative messages.
- Run `git diff --check` before committing.
- Do not push, create a PR, merge, rebase published history, or force-push without explicit human approval.
- Use `.github/pull_request_template.md` when present.
- Link the PR to the correct issue.
- Do not close an issue until implementation is verified and required CI checks pass.
- Before asking for push approval, show changed files, summary, tests, limitations, and commit SHAs.

## Realtime integrity

Realtime correctness is a core product requirement.

### Identity and roles

- Use stable `participantId` as participant identity.
- Never use `socket.id` as durable identity.
- Reconnect must preserve participant ID, score, and accepted buffered buzzes.
- Reconnect must not create duplicate participants.
- A replaced socket must lose control.
- Hosts cannot perform participant actions.
- Participants cannot perform host actions.
- Every host action must verify authenticated session, host role, room ownership, and current host socket.
- Every participant action must verify participant role, participant ID, current socket, and room membership.
- Never trust client-provided roles, ownership, scores, winners, or internal room state.

### Public and internal state

- Backend uses `InternalRoomData` and `InternalParticipant`.
- Frontend uses `PublicRoomData` and `PublicParticipant`.
- Never emit internal room objects.
- Never expose `socketId`, `hostSocketId`, reconnect-token hashes, session IDs, JWTs, timers, or persistence flags.
- Serialize public state through `toPublicRoomData`.
- Emit persistent state through `emitRoomState`.
- Do not add separate ad hoc `safeRoom` implementations.
- `ROOM_STATE_UPDATED` is the authoritative persistent-state event.

### Buzzer timing

- The browser submits raw `Date.now()` as `clientPressedAt`.
- Do not submit `timeSync.getServerTime()` as the press timestamp.
- Apply clock offset exactly once on the backend.
- Preserve the current median offset, RTT, jitter, compensation limit, grace period, and `receivedAt` tie-breaker unless the issue explicitly changes them.
- A successful `BUZZ_SUBMIT` callback means only that the signal was accepted into the grace buffer.
- It does not mean the participant won.
- Announce the winner only from authoritative room state matching the stable `participantId`.
- Associate buffered buzzes with `participantId`, validated time, `receivedAt`, and `roundId`.
- Old timers must not mutate reset, newer, finished, or deleted rooms.

### Socket listeners

- Register long-lived listeners once per component lifecycle.
- Do not make listener effects depend on the current room object.
- Use functional state updates or synchronized refs to avoid stale closures.
- Remove the exact handler during cleanup.
- Do not call `socket.off(eventName)` without a handler unless intentionally removing all listeners.
- Rapid consecutive room snapshots must not be lost.

## Socket.IO contracts

- `packages/shared` is the source of truth for public event names, payloads, callbacks, types, and schemas.
- Every client payload must have runtime validation.
- Zod schemas and TypeScript types must agree.
- Use explicit success and error result unions.
- `ERROR_EVENT` must send `{ message: string }`.
- Every frontend-emitted event must exist in the shared contract.
- Every declared client event must have a backend handler.
- Every server event must have an intentional consumer or be removed.
- Update contract tests whenever protocol behavior changes.
- Do not hide contract errors with `any`, `as any`, or `@ts-ignore` unless an external boundary makes a narrow assertion unavoidable.

## Authentication and sessions

- Host authorization requires a valid, unexpired, non-revoked server-side session.
- JWT verification alone is not sufficient when session revocation applies.
- REST and Socket.IO must apply equivalent session checks.
- Do not add legacy token paths that bypass session validation.
- Logout must revoke the current session and disconnect sockets belonging to it.
- Do not expose host tokens to frontend JavaScript without explicit approval.

## Database and uploads

- SQLite is managed through Prisma.
- Commit schema changes with a Prisma migration.
- Use `prisma migrate deploy` in CI and production.
- Do not use `prisma db push` as the production migration path.
- Do not edit applied migrations.
- Do not run seed automatically.
- Tests must use isolated temporary databases.
- Never run tests or migrations against production data.

Uploads are runtime data:

- Validate size, declared MIME type, and actual file signature.
- Generate safe random filenames and prevent path traversal.
- Store production uploads in the configured persistent volume.
- For replacement: validate new file, update the database, then delete the old file.
- Delete the new file if persistence fails.
- Do not commit uploads.

## Frontend and accessibility

- Use public shared types.
- Treat server snapshots as authoritative.
- One user action must send no more than one buzz.
- Preserve pointer, touch, Enter, and Space interaction.
- After an accepted buzz, show a neutral pending state until the winner snapshot arrives.
- Preserve accessible labels, focus behavior, and live announcements.
- Respect `prefers-reduced-motion`.
- Clear participant reconnect data after room closure, invalid rejoin, or control revocation.

## Testing and CI

- Add a regression test for every fixed defect.
- Test behavior, not only source strings.
- Test successful and rejected authorization paths.
- Test reconnect, replacement socket, stale timers, and public-state serialization when relevant.
- Verify callbacks run no more than once.
- Verify invalid payloads do not mutate state.
- Verify listeners are not repeatedly registered.
- Use fake timers where compatible; use integration tests for real Socket.IO lifecycle behavior.
- Do not use `.skip`, `.only`, weak assertions, or `continue-on-error` to hide failures.

Required CI checks:

- `CI / Install and contract`
- `CI / Backend`
- `CI / Frontend`
- `CI / Docker smoke`
- `CI / Accessibility`

Run relevant checks locally, then verify the actual GitHub Actions run after push.

## Security and repository hygiene

Never commit secrets, `.env` files, JWTs, passwords, API keys, cookies, reconnect tokens, private credentials, production databases, confidential data, or unnecessary PII.

Do not commit generated or runtime artifacts:

- `node_modules/`
- workspace `dist/`
- SQLite files
- runtime uploads
- `playwright-report/`
- `test-results/`
- coverage
- screenshots and traces
- PWA development output
- temporary logs or prompt files

After tests and builds, inspect `git status` and remove unintended generated files.

## Agent conduct

- Reply in Russian unless another language is requested.
- Do not leave product names, agent provenance, or generated-by-agent notices in code, commits, branches, issues, PRs, docs, or changelogs.
- Do not change scope without confirmation.
- Do not delete or overwrite user work without a checkpoint or explicit approval.
- Be explicit about checks that were not run.
- Never claim success without verification evidence.

## Completion report

Before declaring work complete, report:

- linked issue and branch;
- root cause;
- implementation summary;
- changed files;
- acceptance criteria;
- tests and commands executed;
- CI results when available;
- generated-artifact check;
- unresolved limitations;
- commit SHAs;
- remaining approval required for push, PR, or merge.

## Key references

- `README.md`
- `package.json`
- `apps/backend/package.json`
- `apps/frontend/package.json`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.ts`
- `apps/backend/src/realtime/index.ts`
- `apps/backend/src/realtime/validation.ts`
- `apps/backend/src/rooms/index.ts`
- `apps/backend/prisma/schema.prisma`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `.github/ISSUE_TEMPLATE/`
- `.github/pull_request_template.md`
