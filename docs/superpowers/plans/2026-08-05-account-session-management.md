# Account Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить безопасное управление сессиями и необратимое удаление аккаунта с атомарным обезличенным архивом.

**Architecture:** Server-side `Session` остаётся источником истины; общая проверка сессии throttled-обновляет активность. Account deletion использует process-local fence, одну Prisma-транзакцию для архива и рабочих записей, существующие `appEvents` для realtime cleanup и upload utilities для post-commit удаления файлов.

**Tech Stack:** Node.js 22, TypeScript, Express, Prisma 5/SQLite, Socket.IO, React/Vite, Vitest/Testing Library, Jest/Supertest, Playwright/Axe.

## Global Constraints

- Issue: `#69`; branch: `69-account-session-management`; base: `main` at `8915b69`.
- Не выполнять merge или deployment.
- Не использовать production secrets, production DB или реальные платёжные/почтовые операции.
- Не менять Resend/password-reset, тарифы, юридические тексты и обычную игровую механику вне deletion fence.
- Архив бессрочный, без FK на `HostUser`, пользовательского API и восстановления.
- Не добавлять dependency для разбора User-Agent или UI.
- Перед каждой итерацией показать scope и дождаться подтверждения согласно `AGENTS.md`.
- Писать тест до production-кода; не ослаблять существующие проверки.

---

## Итерация 1 — Session persistence и API

### Task 1: Расширить Prisma schema и добавить архивные таблицы

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`
- Create: `apps/backend/prisma/migrations/20260805120000_account_session_management/migration.sql`
- Create: `apps/backend/src/auth/__tests__/session-management.test.ts`

**Interfaces:**
- Produces: nullable `Session.ipAddress`, `Session.userAgent`, `Session.lastSeenAt`.
- Produces: `ArchivedLegalAcceptance`, `ArchivedSubscription`, `ArchivedPayment`, `ArchivedRefund`, `ArchivedPaymentMethod` без relations на `HostUser`.

- [ ] **Step 1: Написать падающий Prisma integration test**

Создать test app и пользователя в `session-management.test.ts`, затем проверить прямую запись legacy и metadata sessions:

```ts
it('stores nullable legacy and metadata session rows', async () => {
  const legacy = await prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + 60_000) },
  });
  const current = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: '203.0.113.8',
      userAgent: 'Mozilla/5.0',
      lastSeenAt: new Date(),
    },
  });

  expect(legacy).toMatchObject({ ipAddress: null, userAgent: null, lastSeenAt: null });
  expect(current).toMatchObject({ ipAddress: '203.0.113.8', userAgent: 'Mozilla/5.0' });
});
```

- [ ] **Step 2: Запустить test и подтвердить ожидаемое падение**

Run: `DATABASE_URL=file:./ci-test.db npm run test -w backend -- session-management.test.ts --runInBand`

Expected: TypeScript/Prisma Client сообщает, что metadata fields отсутствуют.

- [ ] **Step 3: Изменить schema минимальными nullable-полями и архивными моделями**

Использовать общую форму моделей:

```prisma
model ArchivedPayment {
  id                String   @id @default(uuid())
  archiveSubjectId  String
  provider          String
  providerPaymentId String   @unique
  idempotencyKey    String   @unique
  amountMinor       Int
  currency          String
  status            String
  createdAt         DateTime
  paidAt            DateTime?
  updatedAt         DateTime
  archivedAt        DateTime @default(now())

  @@index([archiveSubjectId])
}
```

Повторить только согласованные поля для остальных четырёх archive models. Не добавлять relation fields.

- [ ] **Step 4: Создать безопасную SQLite migration**

SQL должен использовать три `ALTER TABLE "Session" ADD COLUMN` и отдельные `CREATE TABLE`/`CREATE INDEX`; существующую `Session` не пересоздавать. Provider identifiers и `idempotencyKey` получают unique indexes.

- [ ] **Step 5: Сгенерировать client, применить migration к изолированной DB и запустить test**

```bash
session_migration_dir=$(mktemp -d)
DATABASE_URL="file:${session_migration_dir}/test.db" npm run db:generate -w backend
DATABASE_URL="file:${session_migration_dir}/test.db" npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
DATABASE_URL="file:${session_migration_dir}/test.db" npx prisma validate --schema=apps/backend/prisma/schema.prisma
```

Expected: migration, validate и test проходят.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/20260805120000_account_session_management/migration.sql apps/backend/src/auth/__tests__/session-management.test.ts
git commit -m "feat: add account session archive schema"
```

### Task 2: Сохранять metadata и throttled `lastSeenAt`

**Files:**
- Modify: `apps/backend/src/auth/session.ts`
- Modify: `apps/backend/src/auth/index.ts`
- Modify: `apps/backend/src/auth/__tests__/session-management.test.ts`
- Modify: `apps/backend/src/auth/__tests__/profile-security.test.ts`

**Interfaces:**
- Produces: `sessionMetadata(req: Request): { ipAddress: string | null; userAgent: string | null; lastSeenAt: Date }`.
- Produces: `describeUserAgent(value: string | null): { device: string; browser: string }`.
- Changes: `validateHostSession()` touches activity no more than once per five minutes.

- [ ] **Step 1: Добавить failing tests metadata, proxy и throttling**

Проверить registration/login через app с `trust proxy = loopback`, legacy nulls и два случая activity:

```ts
await request(app).post('/auth/login')
  .set('X-Forwarded-For', '203.0.113.9')
  .set('User-Agent', 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1')
  .send({ email, password })
  .expect(200);

await expect(prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }))
  .resolves.toMatchObject({ ipAddress: '203.0.113.9', userAgent: expect.stringContaining('iPhone'), lastSeenAt: expect.any(Date) });
```

Для throttling установить `lastSeenAt` в `now - 6 minutes`, вызвать `/auth/me`, проверить обновление; затем установить recent timestamp, повторить запрос и проверить точное равенство.

- [ ] **Step 2: Запустить focused tests и подтвердить падение**

Run: `DATABASE_URL=file:./ci-test.db npm run test -w backend -- session-management.test.ts profile-security.test.ts --runInBand`

Expected: metadata не сохранена, activity не обновляется.

- [ ] **Step 3: Реализовать stdlib-only metadata и UA parser**

В `session.ts` использовать `Request`, `.slice(0, 64)`, `.slice(0, 512)` и ordered regex checks Edge → Opera → Chrome → Firefox → Safari. Unknown values вернуть русскими нейтральными строками; raw UA наружу не экспортировать через API.

- [ ] **Step 4: Реализовать условный activity touch**

После всех auth checks:

```ts
const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
if (!session.lastSeenAt || session.lastSeenAt <= cutoff) {
  await prisma.session.updateMany({
    where: {
      id: identity.sessionId,
      userId: identity.userId,
      revokedAt: null,
      expiresAt: { gt: now },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: cutoff } }],
    },
    data: { lastSeenAt: now },
  });
}
```

- [ ] **Step 5: Передать metadata в login/register session create**

Вычислять metadata до transaction и передавать `ipAddress`, `userAgent`, `lastSeenAt`; legal acceptance продолжает использовать trusted `req.ip` и header без изменения документа/версии.

- [ ] **Step 6: Запустить focused tests**

Expected: metadata, trusted proxy, legacy и throttling проходят; password-reset tests не меняются.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/auth/session.ts apps/backend/src/auth/index.ts apps/backend/src/auth/__tests__/session-management.test.ts apps/backend/src/auth/__tests__/profile-security.test.ts
git commit -m "feat: record session activity metadata"
```

### Task 3: Добавить session list, individual revoke и logout-all API

**Files:**
- Create: `apps/backend/src/auth/accountManagement.ts`
- Modify: `apps/backend/src/auth/index.ts`
- Modify: `apps/backend/src/events.ts`
- Modify: `apps/backend/src/auth/__tests__/session-management.test.ts`

**Interfaces:**
- Produces: `accountManagementRouter` mounted below `/api/auth`.
- Produces: `GET /sessions`, `DELETE /sessions/:sessionId`, `POST /logout-all`.
- Produces event: `host_logout_all: [userId: string, sessionIds: string[]]`.

- [ ] **Step 1: Написать failing API tests**

Создать current, other-own, foreign, expired и revoked sessions. Проверить точный response shape, отсутствие `userAgent`, `expiresAt`, JWT/cookie и правильный `isCurrent`. Проверить `400` current revoke, одинаковый `404` foreign/missing, успешный own revoke, logout-all и `Set-Cookie` expiry.

- [ ] **Step 2: Запустить test и подтвердить 404 endpoints**

Run: `DATABASE_URL=file:./ci-test.db npm run test -w backend -- session-management.test.ts --runInBand`

- [ ] **Step 3: Реализовать router с ownership predicates**

Список фильтровать одним Prisma query. Individual revoke сначала отклоняет `req.params.sessionId === req.sessionId`, затем выполняет `updateMany` с `id`, `userId`, `revokedAt: null`, `expiresAt > now`; только count `1` считается успехом.

Logout-all внутри transaction перечитывает current Session, получает IDs активных sessions и обновляет их одним `updateMany`. После commit очищает cookie и emits `host_logout_all`.

- [ ] **Step 4: Подключить router и использовать существующие cookie options**

Экспортировать `hostCookieOptions` из `auth/index.ts` либо переместить его в `session.ts`; не дублировать flags/path.

- [ ] **Step 5: Запустить session, profile и password-reset suites**

Expected: новые tests проходят; existing revocation/reset semantics зелёные.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/auth/accountManagement.ts apps/backend/src/auth/index.ts apps/backend/src/events.ts apps/backend/src/auth/__tests__/session-management.test.ts
git commit -m "feat: add session management endpoints"
```

---

## Итерация 2 — Realtime cleanup и account deletion

### Task 4: Закрывать все комнаты при logout-all

**Files:**
- Modify: `apps/backend/src/realtime/index.ts`
- Modify: `apps/backend/src/realtime/__tests__/socket-session-auth.test.ts`

**Interfaces:**
- Consumes: `host_logout_all(userId, sessionIds)`.
- Preserves: обычный `finishAndDeleteRoom()` с history persistence.

- [ ] **Step 1: Написать failing realtime tests**

Подключить две sessions одного host и одну session другого host. Создать комнаты, emit `host_logout_all`, дождаться disconnect/cleanup и проверить: обе target sockets отключены, target rooms удалены с history create, other socket/room не изменены.

- [ ] **Step 2: Запустить focused realtime test**

Run: `DATABASE_URL=file:./ci-test.db npm run test -w backend -- socket-session-auth.test.ts --runInBand`

- [ ] **Step 3: Реализовать listener**

Перед disconnect выставить `intentionalLogout = true`. Выбрать комнаты через `room.hostUserId === userId`, вызвать `finishAndDeleteRoom` с текущими buffers/timer maps, затем отключить sockets, чьи `sessionId` входят в set.

- [ ] **Step 4: Запустить socket-session и room-lifecycle suites**

Expected: logout-all и существующие selective revoke/logout tests проходят.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/realtime/index.ts apps/backend/src/realtime/__tests__/socket-session-auth.test.ts
git commit -m "feat: close host rooms on logout all"
```

### Task 5: Реализовать атомарный архив и DB deletion

**Files:**
- Create: `apps/backend/src/auth/accountDeletionState.ts`
- Modify: `apps/backend/src/auth/accountManagement.ts`
- Modify: `apps/backend/src/auth/session.ts`
- Modify: `apps/backend/src/events.ts`
- Create: `apps/backend/src/auth/__tests__/account-deletion.test.ts`

**Interfaces:**
- Produces: `beginAccountDeletion(userId): boolean`, `isAccountDeletionInProgress(userId): boolean`, `endAccountDeletion(userId): void`.
- Produces: `DELETE /account`.
- Produces event: `host_account_deleted: [userId: string]`.

- [ ] **Step 1: Написать failing validation, limiter и stale-state tests**

Проверить wrong password, exact phrase, boolean confirmation, пять failed attempts/`429`, revoked/expired current Session, hash change between bcrypt and transaction и два concurrent requests.

- [ ] **Step 2: Написать failing archive/cascade/rollback tests на реальной SQLite**

Создать legal, subscription, payment/refund, payment method, history, settings, sessions и reset token. После success проверить отсутствие рабочих rows и точный whitelist archive fields. Для rollback заранее создать `ArchivedPayment` с тем же `providerPaymentId`; deletion должен вернуть `500`, а все рабочие rows остаться.

- [ ] **Step 3: Запустить test и подтвердить отсутствующий endpoint**

Run: `DATABASE_URL=file:./ci-test.db npm run test -w backend -- account-deletion.test.ts --runInBand`

- [ ] **Step 4: Реализовать отдельный limiter**

Ключ: `userId:sessionId:ipKeyGenerator(req.ip)`. Устанавливать `res.locals.accountDeletionVerificationFailed = true` только для invalid body/password/state; success и DB/archive errors не расходуют лимит.

- [ ] **Step 5: Реализовать deletion fence**

Set содержит только `userId`; `begin` использует `Set.has/add`, `end` — `delete`. `validateHostSession` возвращает `AUTH_SESSION_INVALID`, пока fence установлен.

- [ ] **Step 6: Реализовать одну archive/delete transaction**

После preliminary bcrypt и `begin`, повторно проверить hash/current Session. Считать source rows, выполнить `createMany` для archives, затем явные `deleteMany` в утверждённом порядке. `hostUser.deleteMany({ where: { id: userId, passwordHash: verifiedHash } })` должен вернуть count `1`.

Transaction возвращает deduplicated asset URLs. До commit не emit events и не трогать filesystem.

- [ ] **Step 7: Обработать результаты fail closed**

`409` для stale/deleting state, `500` для transaction failure без внутренних деталей. На success после commit emit `host_account_deleted`, очистить cookie и вернуть только `{ success: true }`. В `finally` всегда вызвать `endAccountDeletion`.

- [ ] **Step 8: Запустить account deletion и auth suites**

Expected: validation, limiter, concurrency, rollback, anonymization и cascade tests проходят.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/auth/accountDeletionState.ts apps/backend/src/auth/accountManagement.ts apps/backend/src/auth/session.ts apps/backend/src/events.ts apps/backend/src/auth/__tests__/account-deletion.test.ts
git commit -m "feat: delete accounts transactionally"
```

### Task 6: Закрыть realtime/history/filesystem races

**Files:**
- Modify: `apps/backend/src/realtime/index.ts`
- Modify: `apps/backend/src/realtime/room-lifecycle.ts`
- Modify: `apps/backend/src/auth/accountManagement.ts`
- Modify: `apps/backend/src/utils/upload.ts`
- Modify: `apps/backend/src/auth/__tests__/account-deletion.test.ts`
- Modify: `apps/backend/src/realtime/__tests__/socket-session-auth.test.ts`
- Modify: `apps/backend/src/realtime/__tests__/state-machine.test.ts`

**Interfaces:**
- Consumes: `host_account_deleted(userId)`.
- Changes: `saveGameHistory()` refuses new writes for deleting accounts.
- Produces: safe post-commit cleanup of unshared uploads.

- [ ] **Step 1: Написать failing realtime race tests**

Покрыть account event с target/other rooms, mutation while fenced, pending `ROOM_FINISH`, timeout и disconnect. Использовать существующий deferred history promise pattern; проверить отсутствие нового successful history write, удаление target room и сохранение other room.

- [ ] **Step 2: Написать failing file cleanup tests**

В temp upload dir создать own и shared files. После account deletion own отсутствует, shared остаётся. Замокать только `fsPromises.unlink` failure и проверить: DB deletion успешна, response `200`, безопасный log не содержит userId/path/email.

- [ ] **Step 3: Добавить двойную проверку fence в history save**

Проверять `isAccountDeletionInProgress(room.hostUserId)` до создания promise и повторно внутри `.then()` непосредственно перед `prisma.gameHistory.create`. Для deletion возвращать resolved no-op без установки `historySaved = true`.

- [ ] **Step 4: Реализовать synchronous account cleanup listener**

Для target rooms вызвать существующий `deleteRoom` напрямую с reason удаления аккаунта и всеми buffers/timer maps; history не вызывать. Target sockets пометить intentional и disconnect. Сначала закрыть rooms, затем sockets.

- [ ] **Step 5: Реализовать post-commit file cleanup**

После DB commit и realtime emit пройти по `new Set(assetUrls)`, вызвать `countUploadReferences(prisma, url)`, затем `deleteUploadedFile` только при нуле. Catch логирует `{"event":"account_upload_delete_failed","code":"EIO"}` без URL/path/user data.

- [ ] **Step 6: Запустить deletion/realtime/upload suites**

Expected: все race, idempotency, shared-file и filesystem tests проходят без unhandled rejection.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/realtime/index.ts apps/backend/src/realtime/room-lifecycle.ts apps/backend/src/auth/accountManagement.ts apps/backend/src/utils/upload.ts apps/backend/src/auth/__tests__/account-deletion.test.ts apps/backend/src/realtime/__tests__/socket-session-auth.test.ts apps/backend/src/realtime/__tests__/state-machine.test.ts
git commit -m "fix: close account deletion races"
```

---

## Итерация 3 — Settings UI и accessibility

### Task 7: Добавить frontend API и UI управления аккаунтом

**Files:**
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/pages/HostSettings.tsx`
- Modify: `apps/frontend/src/pages/HostDashboard.tsx`
- Create: `apps/frontend/src/pages/__tests__/HostSettings.account.test.tsx`

**Interfaces:**
- Produces type: `ActiveSession` с `id`, `device`, `browser`, nullable IP/activity и `isCurrent`.
- Produces API methods: `getSessions`, `revokeSession`, `logoutAll`, `deleteAccount`.

- [ ] **Step 1: Написать failing component tests**

Mock только network API/socket/navigation. Проверить loading, unknown legacy values, current badge, revoke row removal, API error/re-enabled control, current logout, logout-all dialog/redirect `/login`, delete form validation, success/redirect `/`, password clearing и accessible labels.

- [ ] **Step 2: Запустить test и подтвердить отсутствующий UI**

Run: `npm run test -w frontend -- HostSettings.account.test.tsx`

- [ ] **Step 3: Добавить typed API methods**

Каждый method проверяет `res.ok`, читает нейтральный `error`, использует credentials через `customFetch`. `DELETE /auth/account` отправляет JSON body с тремя согласованными полями.

- [ ] **Step 4: Добавить sessions card**

Загрузить sessions вместе с user/settings. Использовать `Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })`, existing components и `flex-col sm:flex-row`. У каждой кнопки должен быть уникальный `aria-label` с device/browser.

- [ ] **Step 5: Добавить logout-all и delete dialogs**

Logout-all API вызывается до local `socket.disconnect`, затем `navigate('/login', { replace: true })`. Delete submit доступен только при password, exact phrase и checkbox; success отключает socket и ведёт на `/`.

- [ ] **Step 6: Исправить порядок обычного logout в двух host pages**

Сначала `await api.logout()`, затем `socket.disconnect()` и redirect, чтобы server-side `host_logout` успевал закрыть комнату. Не создавать новый auth store/helper.

- [ ] **Step 7: Запустить frontend focused и существующий profile test**

Expected: account/settings и DashboardLayout profile tests проходят.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/services/api.ts apps/frontend/src/pages/HostSettings.tsx apps/frontend/src/pages/HostDashboard.tsx apps/frontend/src/pages/__tests__/HostSettings.account.test.tsx
git commit -m "feat: add account security settings"
```

### Task 8: Добавить реальную mobile/keyboard/Axe проверку

**Files:**
- Create: `tests/account-settings.spec.ts`

**Interfaces:**
- Consumes: development registration and real `/settings` API.
- Produces: Playwright regression for mobile layout, keyboard and WCAG 2.2 AA.

- [ ] **Step 1: Написать browser test с уникальным test account**

Через `/register` заполнить email `account-settings-${Date.now()}@example.test`, password, оба checkbox; дождаться `/dashboard`, затем открыть `/settings`.

- [ ] **Step 2: Проверить mobile viewport и keyboard**

Установить `375x812`, проверить bounding boxes session card/buttons относительно viewport. Сфокусировать logout-all и delete buttons и активировать `Enter`; проверить dialog role/name и focusable labeled inputs/checkbox.

- [ ] **Step 3: Выполнить Axe scan**

```ts
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  .analyze();
expect(results.violations).toEqual([]);
```

- [ ] **Step 4: Удалить test account через UI**

Заполнить password, `УДАЛИТЬ АККАУНТ`, checkbox и submit; ожидать URL `/`. Это одновременно очищает рабочие test rows.

- [ ] **Step 5: Запустить Playwright Chromium**

Run: `npx playwright test tests/account-settings.spec.ts --project=chromium`

Expected: mobile, keyboard, Axe и deletion flow проходят.

- [ ] **Step 6: Commit**

```bash
git add tests/account-settings.spec.ts
git commit -m "test: cover account settings accessibility"
```

---

## Итерация 4 — Полная проверка и draft PR

### Task 9: Выполнить repository verification

**Files:**
- Inspect only unless a check exposes an in-scope defect.

**Interfaces:**
- Produces: reproducible local verification record for PR body.

- [ ] **Step 1: Проверить Node.js 22 и clean install**

Run: `node --version` (must be `v22.x`), then `PUPPETEER_SKIP_DOWNLOAD=true npm ci`.

- [ ] **Step 2: Shared/Prisma checks на свежей DB**

```bash
npm run build -w shared
npm run db:generate -w backend
verification_db_dir=$(mktemp -d)
DATABASE_URL="file:${verification_db_dir}/test.db" npx prisma validate --schema=apps/backend/prisma/schema.prisma
DATABASE_URL="file:${verification_db_dir}/test.db" npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
```

- [ ] **Step 3: Статические и тестовые проверки**

Run, записывая exit code/counts:

```bash
npm run lint
npm run typecheck
DATABASE_URL=file:./ci-test.db npm run test -w backend
npm run test -w frontend
npm run test:scripts
npm run legal:check:strict
npm run build
npx playwright install chromium
npx playwright test
git diff --check
```

- [ ] **Step 4: Compose config**

Run: `docker compose -p quiz-buzzer-69-config config --quiet`.

- [ ] **Step 5: Docker smoke только при доступном daemon**

Если `docker info` успешен, задать inline safe env (`JWT_SECRET`, test `DATABASE_URL`, `REGISTRATION_ENABLED=true`, test Resend values, `NGINX_PORT=0`), выполнить build/up, найти port через `docker compose port nginx 80`, проверить `/api/health`, frontend и `docker compose ps`, затем `down --remove-orphans` без `-v`. Если daemon недоступен, записать `BLOCKED` с точной ошибкой.

- [ ] **Step 6: Hygiene audit**

Проверить `git status --short`, отсутствие `.env`, SQLite, uploads, reports, traces, coverage, dist и secret-like strings в staged diff. Не удалять unrelated user files.

- [ ] **Step 7: Исправлять только in-scope failures**

После первого failure установить root cause; после одинакового failure дважды не повторять догадочный fix. Любой fix получает focused test и отдельный commit.

### Task 10: Push и создать draft PR

**Files:**
- Inspect: `.github/pull_request_template.md` if it appears before publication.

**Interfaces:**
- Produces: pushed branch and draft PR targeting `main`, closing issue #69.

- [ ] **Step 1: Показать финальный scope перед публикацией**

Run: `git status -sb`, `git diff origin/main...HEAD --stat`, `git log --oneline origin/main..HEAD`, `git diff --check`.

- [ ] **Step 2: Убедиться, что все изменения закоммичены явными paths**

Не использовать `git add -A` при появлении unrelated файлов. Последний commit делать только если verification создала in-scope изменения.

- [ ] **Step 3: Push branch**

Run: `git push -u origin 69-account-session-management`.

- [ ] **Step 4: Создать draft PR**

Title: `Add secure account session management`

Body обязан содержать:

- `Closes #69`;
- Prisma migration и legacy compatibility;
- новые endpoints;
- точный порядок account deletion;
- archive models/whitelist и исключённые PII;
- обработанные race conditions;
- полный список локальных checks и результаты;
- Docker статус;
- single-process limitation и бессрочный archive;
- явное `No deployment or merge performed`.

- [ ] **Step 5: Дождаться GitHub CI**

Проверить все пять jobs через `gh pr checks --watch`: Install and contract, Backend, Frontend, Docker smoke, Accessibility. При failure читать Actions logs до изменения кода.

- [ ] **Step 6: Финальный отчёт**

Сообщить issue/branch, root cause/gap, implementation, changed files, acceptance criteria, local/CI checks, artifacts, limitations, commit SHAs и ссылку на draft PR. Merge/deployment не выполнять.
