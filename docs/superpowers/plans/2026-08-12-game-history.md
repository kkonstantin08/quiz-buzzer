# Game History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the existing host game-history feature with protected navigation, paginated host-scoped data, correct result rendering, recoverable UI states, safe clearing, and focused automated coverage.

**Architecture:** Keep the current Prisma model and authenticated route. Add bounded offset pagination at the API boundary, typed REST data in the existing frontend API service, one result renderer shared by the Dashboard and a new lazy-loaded history page, and retain the existing per-page server-backed auth pattern.

**Tech Stack:** Node.js 22+, TypeScript, Express, Prisma 5/SQLite, React 19, React Router, Tailwind/Shadcn, Jest/Supertest, Vitest/Testing Library, Playwright/Axe.

## Global Constraints

- Issue: `#72`; branch: `72-complete-game-history`; base: `main` at `787da3a`; draft PR: `#73`.
- Do not merge or deploy.
- Do not change the `GameHistory` schema or add a migration.
- Do not add dependencies, round analytics, search, CSV, charts, or unrelated refactors.
- Use `GameResult` semantics: only `WINNER` has a crown, winner name, and score.
- Keep all history operations scoped to the authenticated `hostUserId`.
- Use the existing `DELETE /api/history` clear-all flow with explicit confirmation.
- Use stock Playwright for this first-party site; do not install CloakBrowser.
- Write each behavior test before its production change and observe the expected failure.

---

### Task 1: Add host-scoped backend pagination

**Files:**
- Create: `apps/backend/src/history/__tests__/history.test.ts`
- Modify: `apps/backend/src/history/index.ts`

**Interfaces:**
- Consumes: `GET /api/history?page=<positive integer>&limit=<positive integer>`.
- Produces: `{ history, count, page, pageSize, totalPages }`.
- Preserves: `DELETE /api/history` and `requireAuth`.

- [ ] **Step 1: Write real-database RED tests**

Mount `historyRouter` below a test-only authentication middleware that derives `userId` from `x-user-id`. Create two host users and explicit history rows. Test the first and second pages with literal expected IDs, invalid page/limit values with `400`, a limit above 50 capped to 50, and deletion that removes only the requesting host's rows.

```ts
expect(first.body).toMatchObject({
  count: 12,
  page: 1,
  pageSize: 5,
  totalPages: 3,
});
expect(first.body.history.map((row: { id: string }) => row.id)).toEqual([
  'owner-11', 'owner-10', 'owner-09', 'owner-08', 'owner-07',
]);
expect(await prisma.gameHistory.count({ where: { hostUserId: other.id } })).toBe(1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
DATABASE_URL=file:./history-test.db npm run test -w backend -- history.test.ts --runInBand
```

Expected: pagination metadata and requested slices fail because the route still uses fixed `take: 10`.

- [ ] **Step 3: Implement bounded parsing and one paginated query**

Use a small local parser; arrays, decimals, zero, negatives, and non-digits return `400`.

```ts
const parsePositiveInteger = (value: unknown, fallback: number) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) return null;
  return Number(value);
};

const requestedLimit = parsePositiveInteger(req.query.limit, 10);
const pageSize = Math.min(requestedLimit, 50);
const where = { hostUserId: req.userId! };
const [history, count] = await Promise.all([
  prisma.gameHistory.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
  prisma.gameHistory.count({ where }),
]);
```

- [ ] **Step 4: Run RED test to GREEN**

Run the focused command again. Expected: backend history tests pass with real SQLite ordering and isolation.

- [ ] **Step 5: Commit the backend slice**

```bash
git add apps/backend/src/history/index.ts apps/backend/src/history/__tests__/history.test.ts
git commit -m "feat: paginate host game history"
```

### Task 2: Centralize result semantics and fix the Dashboard

**Files:**
- Create: `apps/frontend/src/components/GameHistoryResult.tsx`
- Create: `apps/frontend/src/components/__tests__/GameHistoryResult.test.tsx`
- Create: `apps/frontend/src/pages/__tests__/HostDashboard.test.tsx`
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/pages/HostDashboard.tsx`
- Modify: `apps/frontend/src/pages/TariffPage.tsx`

**Interfaces:**
- Produces: `GameHistoryItem`, `GameHistoryPage`, and `api.getHistory(page?, limit?)`.
- Produces: `<GameHistoryResult game={item} />` for Dashboard and full history.

- [ ] **Step 1: Write result-rendering RED tests**

Render literal `WINNER`, `DRAW`, and `NO_WINNER` items. Assert `WINNER` exposes `Анна`, `7`, and accessible winner icon text; the other results expose neutral labels and do not render `Анна`, `7`, or the crown.

```ts
expect(screen.getByText('Ничья')).toBeInTheDocument();
expect(screen.queryByLabelText('Победитель')).not.toBeInTheDocument();
expect(screen.queryByText('Анна')).not.toBeInTheDocument();
```

- [ ] **Step 2: Write Dashboard RED tests**

Mock only REST/socket boundaries. Assert the Dashboard calls `getHistory(1, 5)`, renders all three result types correctly, retains total count, and links to `/history`.

- [ ] **Step 3: Run focused frontend tests and verify RED**

```bash
npm run test -w frontend -- GameHistoryResult.test.tsx HostDashboard.test.tsx
```

Expected: missing component/types and current false winner/crown output fail.

- [ ] **Step 4: Add typed API pagination**

Define the REST shape beside the existing API client and encode query parameters with `URLSearchParams`.

```ts
export interface GameHistoryItem {
  id: string;
  roomCode: string;
  result: GameResult;
  winnerName: string | null;
  winnerScore: number;
  participants: number;
  createdAt: string;
}
```

Use `throwApiError` for both load and clear failures so the UI receives translated server errors.

- [ ] **Step 5: Implement the minimal shared renderer and compact Dashboard**

Use Lucide icons, never emoji. `GameResult.WINNER` is the only branch that reads `winnerName` or `winnerScore`; malformed winner rows fall back to `Без победителя`. Replace `slice(0, 5)` with the five-row backend response and add a router link to the full page.

- [ ] **Step 6: Correct the one overpromising tariff string**

Replace `Детальная история проведенных игр` with `История проведённых игр`. No other tariff scope changes.

- [ ] **Step 7: Run focused tests to GREEN and commit**

```bash
npm run test -w frontend -- GameHistoryResult.test.tsx HostDashboard.test.tsx
git add apps/frontend/src/components/GameHistoryResult.tsx apps/frontend/src/components/__tests__/GameHistoryResult.test.tsx apps/frontend/src/pages/HostDashboard.tsx apps/frontend/src/pages/__tests__/HostDashboard.test.tsx apps/frontend/src/services/api.ts apps/frontend/src/pages/TariffPage.tsx
git commit -m "fix: render game results consistently"
```

### Task 3: Add the protected full history experience and navigation

**Files:**
- Create: `apps/frontend/src/pages/HostHistory.tsx`
- Create: `apps/frontend/src/pages/__tests__/HostHistory.test.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/DashboardLayout.tsx`
- Modify: `apps/frontend/src/components/__tests__/DashboardLayout.profile.test.tsx`

**Interfaces:**
- Produces: protected `/history` route.
- Consumes: `GameHistoryResult`, `api.getMe`, `api.getHistory`, `api.clearHistory`.
- Preserves: existing DashboardLayout create-room, profile, logout, and billing behavior.

- [ ] **Step 1: Write history-page RED tests**

Mock REST/socket boundaries and render the real page. Cover initial loading; local date/time, room code, participants and result; empty state; error `role="alert"` plus retry; previous/next requests; invalid auth redirect; clear dialog requiring exact `ОЧИСТИТЬ`; success empty state; and clear failure with enabled retry.

```ts
expect(screen.getByRole('button', { name: 'Удалить всю историю' })).toBeDisabled();
fireEvent.change(screen.getByLabelText('Введите ОЧИСТИТЬ'), { target: { value: 'ОЧИСТИТЬ' } });
expect(screen.getByRole('button', { name: 'Удалить всю историю' })).toBeEnabled();
```

- [ ] **Step 2: Extend layout navigation tests and verify RED**

Render at `/history` and assert desktop `История игр` and mobile `Открыть историю игр` navigate correctly, current state is exposed with `aria-current="page"`, and every mobile icon control has an accessible name.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
npm run test -w frontend -- HostHistory.test.tsx DashboardLayout.profile.test.tsx
```

Expected: missing route/page and disabled/no mobile history navigation fail.

- [ ] **Step 4: Implement the page with existing UI primitives**

Use `DashboardLayout`, `Card`, `Button`, and `Dialog`. Load `/auth/me`, then the requested history page. Use `Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })`. Cards use stable `game.id`, wrap room codes, and never require horizontal scrolling.

- [ ] **Step 5: Implement bounded page transitions and safe clearing**

Disable previous on page 1 and next on `page >= totalPages`. Clear requires exact confirmation, displays pending state, calls only `api.clearHistory()`, then resets `history`, `count`, `page`, and `totalPages` to the empty state. Failure stays in the dialog with `role="alert"`.

- [ ] **Step 6: Wire route and navigation**

Lazy-load `HostHistory` in `App.tsx`. Replace the disabled desktop button with a router-aware control and add the mobile history button. Add `aria-label` to tariff, dashboard/settings, and logout mobile icons without changing their behavior.

- [ ] **Step 7: Run focused tests to GREEN and commit**

```bash
npm run test -w frontend -- HostHistory.test.tsx DashboardLayout.profile.test.tsx GameHistoryResult.test.tsx HostDashboard.test.tsx
git add apps/frontend/src/App.tsx apps/frontend/src/pages/HostHistory.tsx apps/frontend/src/pages/__tests__/HostHistory.test.tsx apps/frontend/src/components/DashboardLayout.tsx apps/frontend/src/components/__tests__/DashboardLayout.profile.test.tsx
git commit -m "feat: add full game history page"
```

### Task 4: Cover real navigation, mobile layout, and clear-all lifecycle

**Files:**
- Create: `tests/game-history.spec.ts`

**Interfaces:**
- Consumes: real registration, room creation, participant join, room finish, `/history`, and clear-all API/UI.

- [ ] **Step 1: Write Playwright RED scenarios**

Add one unauthenticated test proving `/history` redirects to `/login`. Add one authenticated lifecycle test that:

1. registers a unique host and activates the trial;
2. creates a room and reads the participant URL from the existing QR dialog;
3. joins one participant in a second browser context;
4. finishes the room, producing a real `NO_WINNER` history record;
5. opens history through desktop navigation and verifies record content;
6. switches to 375×812, verifies the mobile history control and no horizontal overflow;
7. confirms clear is impossible before entering `ОЧИСТИТЬ`, clears, and observes the empty state;
8. runs Axe on the history main content and clear dialog.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Prepare an isolated migrated database and run:

```bash
history_e2e_dir=$(mktemp -d)
DATABASE_URL="file:${history_e2e_dir}/test.db" npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
DATABASE_URL="file:${history_e2e_dir}/test.db" PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/game-history.spec.ts
```

Expected: `/history` is unavailable or navigation/clear selectors fail before implementation.

- [ ] **Step 3: Fix only reproduced integration defects**

If the real lifecycle exposes a mismatch, add the narrowest regression test in the owning backend/frontend suite before production changes. Do not alter buzzer timing, room state, auth policy, or schema.

- [ ] **Step 4: Run focused backend/frontend/E2E suites**

```bash
npm run test -w backend -- history.test.ts room-lifecycle.test.ts --runInBand
npm run test -w frontend -- GameHistoryResult.test.tsx HostDashboard.test.tsx HostHistory.test.tsx DashboardLayout.profile.test.tsx
DATABASE_URL="file:${history_e2e_dir}/test.db" PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/game-history.spec.ts
```

- [ ] **Step 5: Commit E2E coverage**

```bash
git add tests/game-history.spec.ts
git commit -m "test: cover game history lifecycle"
```

### Task 5: Verify iteration 1 completely

**Files:**
- No intended production changes; fix only failures attributable to iteration 1 with a reproducing test first.

**Interfaces:**
- Produces: a green iteration-1 checkpoint before iteration 2.

- [ ] **Step 1: Clean install under the bundled Node runtime**

```bash
PATH=/Users/kk0sta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm ci
```

- [ ] **Step 2: Prepare and validate an isolated SQLite database**

```bash
history_verify_dir=$(mktemp -d)
export DATABASE_URL="file:${history_verify_dir}/test.db"
npm run build -w shared
npm run db:generate -w backend
npx prisma validate --schema=apps/backend/prisma/schema.prisma
npm run db:migrate -w backend
```

- [ ] **Step 3: Run static, unit, integration, script, and build checks**

```bash
npm run lint
npm run typecheck
npm run test -w backend -- --runInBand
npm run test -w frontend
npm run test:scripts
npm run build
npm run legal:check:strict
```

- [ ] **Step 4: Run complete Playwright/accessibility**

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npx playwright test
```

- [ ] **Step 5: Run production-style Docker smoke without deleting volumes**

Use an ASCII Compose project name and safe test environment. Run build, `up -d`, health, frontend, and `ps`, then:

```bash
docker compose -p quiz-history down --remove-orphans
```

Never use `down -v`.

- [ ] **Step 6: Check diff and generated artifacts**

```bash
git diff --check
git status --short
```

Remove only generated artifacts created by these commands; preserve unrelated user files.

- [ ] **Step 7: Push the green iteration checkpoint and update draft PR #73**

```bash
git push origin 72-complete-game-history
```

Update the PR body with exact counts and check results. Do not mark ready, merge, or deploy.
