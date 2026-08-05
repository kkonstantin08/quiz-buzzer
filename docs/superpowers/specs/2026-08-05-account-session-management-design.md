# Управление сессиями и удаление аккаунта — дизайн

## Контекст

Документ описывает реализацию issue #69: активные сессии, отзыв отдельных сессий, выход со всех устройств и необратимое удаление аккаунта с обезличенным юридическим и финансовым архивом.

Решение сохраняет текущую архитектуру: httpOnly cookie `hostToken`, JWT только с `userId` и `sessionId`, server-side Prisma `Session`, единый `appEvents`, in-memory комнаты и один backend-процесс. Deployment и merge не входят в задачу.

## Цели и ограничения

- Пользователь видит и завершает только собственные активные сессии.
- Отзыв действует сразу для HTTP и Socket.IO.
- Текущая сессия не отзывается endpoint отдельного завершения.
- Logout-all отзывает текущую сессию, завершает комнаты обычным способом и сохраняет историю.
- Account deletion необратимо удаляет рабочие данные и не создаёт историю после начала удаления.
- Юридические и финансовые записи архивируются атомарно с удалением рабочих записей.
- Архив бессрочный, не имеет пользовательского API, механизма восстановления и FK на `HostUser`.
- Resend, password-reset flow, платёжный тариф, юридические тексты и обычная игровая механика не меняются.
- Новые тяжёлые зависимости не добавляются.

## Модель сессии

`Session` получает nullable-поля, поэтому существующие строки остаются совместимыми:

- `ipAddress String?`;
- `userAgent String?`;
- `lastSeenAt DateTime?`.

Новые сессии при регистрации и входе сохраняют:

- IP из `req.ip`, который уже учитывает fail-closed `TRUST_PROXY`;
- `User-Agent` из request header;
- `lastSeenAt` со временем создания сессии.

IP ограничивается 64 символами, User-Agent — 512 символами. Отсутствующие или legacy-значения сохраняются как `null`.

`validateHostSession` остаётся общей точкой HTTP и Socket.IO авторизации. После успешной проверки она обновляет `lastSeenAt`, только если значение отсутствует или старше пяти минут. Условный `updateMany` повторно ограничивается `sessionId`, `userId`, `revokedAt: null` и актуальным `expiresAt`, поэтому устаревшая параллельная проверка не оживляет отозванную сессию.

## Представление устройства

Небольшой локальный parser распознаёт распространённые семейства:

- устройства/ОС: iPhone, iPad, Android, Windows, macOS, Linux;
- браузеры: Edge, Opera, Chrome, Firefox, Safari.

В остальных случаях API возвращает «Неизвестное устройство» и «Неизвестный браузер». Исходный User-Agent не передаётся клиенту. Версии и fingerprinting не добавляются.

## API управления сессиями

### `GET /api/auth/sessions`

Возвращает только сессии текущего `userId`, где `revokedAt IS NULL` и `expiresAt > now`:

```json
{
  "sessions": [
    {
      "id": "opaque-session-id",
      "device": "macOS",
      "browser": "Safari",
      "ipAddress": "203.0.113.10",
      "createdAt": "2026-08-05T10:00:00.000Z",
      "lastSeenAt": "2026-08-05T10:05:00.000Z",
      "isCurrent": true
    }
  ]
}
```

`id` — случайный идентификатор DB-записи, используемый только как target отзыва. Он не является credential и всегда проверяется вместе с authenticated `userId`. JWT, cookie, password hash и исходный User-Agent не возвращаются.

### `DELETE /api/auth/sessions/:sessionId`

- Сравнивает target с `req.sessionId` и отклоняет текущую сессию.
- Атомарно обновляет только активную строку с target `id` и текущим `userId`.
- Чужая и несуществующая сессии получают одинаковый нейтральный `404`.
- После commit отправляет `host_sessions_revoked` с единственным session ID.

### `POST /api/auth/logout-all`

- Повторно подтверждает активность текущей сессии в транзакции.
- Отзывает все активные сессии пользователя, включая текущую.
- Очищает `hostToken` теми же cookie options.
- Отправляет отдельное событие logout-all с `userId` и отозванными session IDs.
- Socket.IO помечает соответствующие host sockets как intentional logout, отключает их и штатно завершает все комнаты этого `hostUserId` через существующий history/finalization flow.

Endpoint не возвращает session IDs или другие внутренние данные.

## Архивные модели

Для каждой архивной строки создаётся собственный случайный `id`; все строки одного удаления получают случайный `archiveSubjectId`. Таблица соответствия с `HostUser` не создаётся.

### `ArchivedLegalAcceptance`

- `archiveSubjectId`;
- `documentType`;
- `documentVersion`;
- `acceptanceSource`;
- `acceptedAt`;
- `archivedAt`.

### `ArchivedSubscription`

- `archiveSubjectId`;
- `status`;
- `currentPeriodStart`, `currentPeriodEnd`;
- `autoRenew`, `cancelAtPeriodEnd`;
- `canceledAt`, `nextChargeAt`;
- `lastPaymentId`, `providerPaymentMethodId`;
- исходные `createdAt`, `updatedAt`;
- `archivedAt`.

### `ArchivedPayment`

- `archiveSubjectId`;
- `provider`, `providerPaymentId`, `idempotencyKey`;
- `amountMinor`, `currency`, `status`;
- `createdAt`, `paidAt`, `updatedAt`;
- `archivedAt`.

### `ArchivedRefund`

- `archiveSubjectId`;
- `providerPaymentId`, `providerRefundId`;
- `amountMinor`, `currency`, `status`;
- `createdAt`, `updatedAt`;
- `archivedAt`.

### `ArchivedPaymentMethod`

- `archiveSubjectId`;
- `provider`, `providerPaymentMethodId`;
- `recurringEnabled`, `consentedAt`, `disabledAt`;
- `createdAt`, `updatedAt`;
- `archivedAt`.

Все модели имеют индекс по `archiveSubjectId`, но не имеют relation/FK на `HostUser`. Provider identifiers сохраняют уникальность, чтобы конфликт архивирования приводил к rollback.

Архив не содержит `HostUser.id`, внутренних payment/refund UUID, имени, email, IP, User-Agent, файлов, password hash, session/reset identifiers, `freeTrialUsed`, `description` и `reason`. Свободные текстовые поля исключены, поскольку могут содержать PII.

## Endpoint удаления аккаунта

### `DELETE /api/auth/account`

Тело:

```json
{
  "currentPassword": "user input",
  "confirmationPhrase": "УДАЛИТЬ АККАУНТ",
  "irreversibleConfirmed": true
}
```

Endpoint использует отдельный лимитер: не более пяти неуспешных проверок за 15 минут на комбинацию `userId`, `sessionId` и trusted IP. Успехи и инфраструктурные ошибки не расходуют лимит.

### Последовательность

1. `requireAuth` проверяет JWT и server-side Session.
2. Проверяются типы, точная confirmation phrase и `irreversibleConfirmed === true`.
3. Загружается текущий password hash и выполняется `bcrypt.compare`.
4. Для `userId` устанавливается process-local deletion fence. Второй параллельный запрос получает нейтральный `409`.
5. Создаётся случайный `archiveSubjectId`.
6. В одной Prisma-транзакции повторно читаются пользователь и текущая сессия. Password hash должен совпасть с первоначально проверенным, а сессия должна принадлежать пользователю, быть активной, неистёкшей и неотозванной.
7. В транзакции читаются legal/billing записи и три возможные ссылки на uploads.
8. В транзакции создаются все архивные строки.
9. В транзакции явно удаляются рабочие записи в порядке: refunds, payments, payment methods, legal acceptances, subscription, game history, password-reset tokens, sessions, settings, затем `HostUser`.
10. Финальное удаление `HostUser` выполняется условно по `id` и неизменному password hash; ожидается ровно одна удалённая строка.
11. Только после commit отправляется `host_account_deleted`.
12. Socket.IO синхронно закрывает без сохранения истории все комнаты с данным `hostUserId`, очищает timers/buffers/mappings и отключает все сокеты этого пользователя.
13. Cookie очищается.
14. После commit для уникальных avatar/logo/background URL повторно считаются ссылки оставшихся пользователей. Файл удаляется только при нулевом числе ссылок.
15. Ошибка удаления отдельного файла не меняет успешный результат DB-операции.

При любой ошибке до commit Prisma откатывает архив и удаления. Событие realtime cleanup не отправляется, файлы не трогаются, deletion fence снимается, аккаунт и комнаты остаются доступными.

## Защита от гонок

Process-local deletion fence соответствует текущему single-backend deployment. Его проверяют `validateHostSession` и `saveGameHistory`.

- Два удаления: только один запрос получает fence; повторная транзакционная проверка защищает от процессов, уже прошедших middleware.
- Смена пароля: транзакция удаления сравнивает hash с первоначально проверенным. Изменившийся hash делает удаление недействительным.
- Stale/revoked session: `requireAuth` и повторная транзакционная проверка fail closed.
- Session revoke против Socket.IO mutation: точкой линеаризации считается последняя успешная server-side проверка Session. После commit отзыва новые mutations не начинаются, а socket немедленно отключается.
- Удаление во время игры: после установки fence новые host mutations и history writes отклоняются.
- Уже начатый history write: SQLite сериализует запись и удаление. Запись либо завершается до account transaction и удаляется её явным `deleteMany`, либо выполняется после удаления пользователя и отклоняется FK.
- `ROOM_FINISH`, timeout и disconnect используют существующие `historySavePromises`, `roomFinalizationPromises` и идемпотентный `deleteRoom`. Повторная очистка удалённой комнаты безопасно возвращает `false`.
- Account deletion закрывает комнаты без истории; logout/logout-all сохраняют существующие правила истории.
- Realtime cleanup выбирает комнаты строго по `hostUserId`, поэтому комнаты других ведущих не затрагиваются.

Перед горизонтальным масштабированием deletion fence и rate-limit store потребуется вынести в общий store. Это не входит в текущий single-process scope.

## Файлы и логирование

Удаление использует существующие `deleteUploadedFile` и `countUploadReferences`. Произвольные, внешние, nested и traversal URL игнорируются текущей безопасной проверкой upload path.

Filesystem error логируется структурированным событием с типом операции и безопасным error code. В лог не попадают user ID, URL/path, email, пароль, confirmation phrase, JWT, cookie, reset token или архивная запись.

## Интерфейс настроек

В `HostSettings` добавляется карточка «Активные сессии»:

- responsive layout от одной колонки на мобильном экране до строки на широком;
- устройство и браузер;
- IP или «Неизвестен»;
- дата входа и последняя активность через `Intl.DateTimeFormat('ru-RU')`;
- badge «Текущая сессия»;
- «Завершить» только для другой сессии;
- обычный «Выйти» для текущей;
- состояния loading, empty, API error и pending action.

Logout-all открывает отдельный confirmation dialog. После успеха frontend отключает socket и переходит на `/login` с `replace: true`.

В существующей опасной зоне добавляется отдельное удаление аккаунта. Dialog содержит:

- password input с доступной подписью;
- input для точной фразы;
- нативный checkbox подтверждения необратимости;
- destructive submit, недоступный до выполнения всех условий;
- status/error announcements.

После успеха frontend очищает поля, отключает socket и переходит на `/` с `replace: true`. Host auth data не хранится в localStorage; httpOnly cookie очищается сервером.

Используются существующие Card, Dialog, Button, Input, Label и responsive Tailwind-паттерны. Новая UI-библиотека не добавляется.

## Ошибки API

- `400` — невалидное тело, текущая сессия в individual revoke, неправильный пароль или confirmation.
- `401` — отсутствующая, истёкшая, отозванная или удалённая Session.
- `404` — чужая либо несуществующая target session без раскрытия различий.
- `409` — удаление уже выполняется или sensitive state изменилось.
- `429` — превышен deletion limiter.
- `500` — архивирование/транзакция не завершены; рабочие данные сохранены.

Ответы не содержат hashes, tokens, cookies, полных архивных объектов или внутренних причин DB/filesystem ошибок.

## Тестирование

### Backend integration

- metadata при регистрации и входе;
- trusted-proxy IP и игнорирование spoofed forwarded headers без trust;
- nullable legacy metadata;
- обновление отсутствующего/устаревшего `lastSeenAt` и отсутствие записи внутри пятиминутного окна;
- список только собственных активных сессий и `isCurrent`;
- individual revoke другой сессии;
- запрет current/foreign revoke;
- logout-all, все активные sessions revoked, cookie cleared;
- неправильный пароль, phrase и boolean confirmation;
- пять неуспешных попыток и `429`;
- stale/revoked current session;
- два параллельных удаления;
- смена пароля во время удаления;
- rollback через реальный конфликт уникального provider identifier в архиве;
- точный состав и обезличивание архива;
- явное удаление profile/settings/subscription/history/sessions/reset/legal/payment данных;
- удаление собственных временных upload-файлов;
- сохранение shared-файла;
- filesystem failure после commit без восстановления аккаунта и без PII в логе.

### Realtime regression

- selective revoke немедленно отключает только target session;
- logout-all отключает все host sockets и штатно закрывает комнаты;
- account deletion закрывает комнаты пользователя без history write;
- pending `ROOM_FINISH` плюс deletion;
- timeout/disconnect плюс deletion;
- mutations из revoked/deleting session отклоняются;
- повторный cleanup безопасен;
- комнаты другого `hostUserId` не меняются.

### Frontend component tests

- загрузка sessions;
- unknown legacy device/IP/activity;
- current badge и обычный logout;
- завершение другой сессии и обновление списка;
- logout-all confirmation, socket disconnect и redirect;
- delete form validation;
- успешное удаление, очистка полей/socket и redirect;
- API errors и повторная доступность controls;
- accessible labels, dialog semantics, keyboard-activated actions и responsive class structure.

### Browser accessibility and mobile

Штатный Playwright используется для собственного сайта без anti-bot защиты. Временный тестовый аккаунт проверяет:

- `/settings` при mobile viewport;
- отсутствие горизонтального выхода основных controls за viewport;
- keyboard navigation по session и danger actions;
- accessible names/roles;
- Axe WCAG 2.2 AA для страницы и dialogs.

Тестовый аккаунт и DB изолированы; production credentials и внешние сервисы не используются.

## Проверка

Все команды выполняются под Node.js 22:

1. `npm ci`;
2. `npm run build -w shared`;
3. `npm run db:generate -w backend`;
4. `npx prisma validate --schema=apps/backend/prisma/schema.prisma`;
5. `npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma` на отдельной test DB;
6. `npm run lint`;
7. `npm run typecheck`;
8. `npm run test -w backend`;
9. `npm run test -w frontend`;
10. realtime focused suites;
11. `npx playwright test`;
12. `npm run build`;
13. `npm run test:scripts`;
14. `npm run legal:check:strict`;
15. `docker compose -p quiz-buzzer-69-config config --quiet`;
16. Docker build/up/health/ps/down smoke при доступном daemon, без удаления volumes;
17. `git diff --check`;
18. проверка `git status`, generated artifacts и secret patterns.

После push ожидаются все пять GitHub checks: Install and contract, Backend, Frontend, Docker smoke и Accessibility. Deployment и merge не выполняются.
