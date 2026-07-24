# Викторина (Buzzer MVP)

Система интерактивной викторины (брейн-ринг) в реальном времени, позволяющая ведущему создавать комнаты, а участникам — соревноваться в скорости реакции ("Кто нажмет кнопку первым").

## 🚀 Стек технологий

Проект организован как monorepo (npm workspaces) и включает в себя:
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Shadcn UI, Socket.IO Client.
- **Backend**: Node.js, Express, Socket.IO (WebSockets), TypeScript, SQLite (Prisma + миграции).
- **Shared**: Общие TypeScript-типы и интерфейсы для синхронизации клиента и сервера.

## 🛠 Локальный запуск и тестирование

Для запуска вам потребуется установленный [Node.js](https://nodejs.org/) (версия 22).

### 1. Установка и запуск

1. **Откройте проект** в терминале.
2. **Настройте переменные окружения**:
   ```bash
   cp .env.example .env
   # Откройте .env и установите JWT_SECRET, сгенерировав его, например, так:
   # openssl rand -base64 32
   ```
3. **Установите зависимости** (выполняется один раз из корня проекта):
   ```bash
   npm install
   ```
4. **Соберите общие типы и сгенерируйте Prisma-клиент** (важно для первого запуска):
   ```bash
   npm run build -w shared
   npm run db:generate -w apps/backend
   ```
   *(Примечание: эти шаги могут быть встроены в общий процесс запуска в будущих обновлениях).*
5. **Запустите проект**:
   ```bash
   npm run dev
   ```
> Благодаря пакету `concurrently`, эта команда автоматически и параллельно запустит и backend (на порту 3001), и frontend.

### 2. Как узнать IP-адрес для подключения с телефона

Чтобы тестировать викторину с телефона, он должен быть подключен к **той же Wi-Fi сети**, что и ваш компьютер.

После запуска `npm run dev`, обратите внимание на вывод в терминале от Vite. Там будет строчка `Network:` с вашим локальным IP-адресом:
```text
  VITE v8.1.2  ready in 296 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://10.91.50.114:5173/   <-- Это ваш локальный адрес!
```

### 3. Процесс тестирования игры

Для полноценного тестирования механик:
1. **Ведущий (на компьютере):**
   Откройте в браузере на компьютере ссылку `http://localhost:5173/login`. 
   - Используйте аккаунт, который вы создали через seed (см. раздел "Создание тестового пользователя").
   - Нажмите "Создать комнату" и запомните сгенерированный код комнаты (например, `XYZ123`).
2. **Участник (на телефоне):**
   - Откройте браузер на смартфоне и введите Network-адрес из терминала (например, `http://10.91.50.114:5173`).
   - Введите код комнаты и свое имя.
3. **Игра:**
   - Ведущий мгновенно видит подключившегося игрока на своем экране.
   - Как только участник нажимает на кнопку на телефоне, она блокируется, срабатывает вибрация (если поддерживается телефоном), а у ведущего высвечивается победитель.
   - Ведущий нажимает "Сбросить" на компьютере, и кнопка на телефоне снова загорается, приглашая к игре.

---

## 📌 Ключевые функции
- **Мгновенная синхронизация и защита от задержек (Latency):** Использование WebSockets с компенсацией рассинхронизации времени (TimeSync) и Grace Period гарантирует честное определение победителя даже при медленном интернете у участников.
- **Управление комнатой:** Ведущий контролирует сброс кнопок и имеет возможность загружать кастомный логотип для своей комнаты (настройки в личном кабинете).
- **Адаптивный интерфейс:** Кнопка участника спроектирована для удобного и молниеносного нажатия с мобильного телефона.
- **Подписки и Авторизация:** Доступ к созданию комнат есть только у ведущих с активной подпиской.

## Аутентификация ведущего

Ведущий аутентифицируется только через httpOnly cookie `hostToken`. JWT действует только вместе с активной server-side Session: REST API и Socket.IO применяют одинаковую проверку сессии. Невалидная host-cookie отклоняется до подключения (Fail Closed); клиент может вызвать recovery endpoint, который только удаляет cookie и не изменяет сессии. Участники подключаются без host-сессии.

## 🌍 Развертывание (Docker / Production)

Проект использует **SQLite** как базу данных. Файл базы данных хранится в именованном Docker volume (`backend_data`), смонтированном в `/app/prisma/`.
Загруженные файлы (логотипы, фоны, аватарки) хранятся в volume (`backend_uploads`), смонтированном в `/app/uploads/` (настраивается через `UPLOAD_DIR` в `.env`).

### Первый запуск

Обычный запуск (без туннеля, доступно локально через nginx на порту 80):
```bash
docker compose up --build -d
```

Запуск с публичным туннелем Cloudflare:
```bash
docker compose --profile tunnel up --build -d
```

При запуске backend-контейнера `entrypoint.sh` **автоматически** применяет Prisma-миграции перед стартом сервера.

Если миграция завершится с ошибкой, контейнер не запустится (`set -e`).

### Reverse proxy и cookie

По умолчанию `.env` использует безопасные локальные значения:

```env
TRUST_PROXY=false
COOKIE_SECURE=false
PAYMENTS_ENABLED=false
```

Без `TRUST_PROXY` backend игнорирует клиентский `X-Forwarded-For`. Docker Compose запускает nginx и backend в выделенной внутренней сети: backend доверяет только фиксированному IP nginx (`172.30.0.10`). Nginx принимает `CF-Connecting-IP` и `X-Forwarded-Proto` только от фиксированного контейнера `cloudflared` (`172.30.0.11`); для protocol допускаются только `http` и `https`, иначе используется локальный `$scheme`. Для API, Socket.IO и uploads nginx перезаписывает `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` и `X-Forwarded-Host`, поэтому произвольный forwarded-заголовок клиента не передаётся дальше.

`COOKIE_SECURE=false` сохраняет локальное HTTP-тестирование. Для внешнего HTTPS задайте `COOKIE_SECURE=true` явно после настройки домена и TLS: приложение не включает HTTPS автоматически и не выводит этот флаг из request headers. При отсутствии `COOKIE_SECURE` временно поддерживается `USE_HTTPS=true`; `COOKIE_SECURE` всегда имеет приоритет.

### Проверка healthcheck

Healthcheck проверяет не только доступность порта, но и соединение с базой данных:
Внутренняя проверка через Docker:
```bash
docker compose ps   # STATUS: healthy
```

Прямая внешняя проверка (через nginx):
```bash
curl http://localhost/api/health
# {"status":"ok","database":"connected"}
```

Внутренняя проверка внутри контейнера backend (порт 3001):
```bash
docker compose exec backend curl http://localhost:3001/api/health
```

### Создание тестового пользователя (Seed)

Seed **не запускается автоматически** и не содержит значений по умолчанию в целях безопасности. Выполняйте его явно, задав переменные:
```bash
# После запуска контейнеров
docker compose exec -e SEED_ADMIN_EMAIL=admin@example.com -e SEED_ADMIN_PASSWORD=strongpassword backend node dist/prisma/seed.js
```

Либо локально:
```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=strongpassword npm run db:seed -w apps/backend
```

### Применение новых миграций

При обновлении схемы:
```bash
# 1. Создать новую миграцию (разработка)
cd apps/backend && npx prisma migrate dev --name <название_изменения>

# 2. Задеплоить (production) — выполняется автоматически при перезапуске контейнера
docker compose up -d --no-deps --build backend
```

### Сброс и удаление

Остановка без удаления данных (контейнеры останавливаются, база сохраняется):
```bash
docker compose down
```

Остановка с удалением данных (ДАННЫЕ БУДУТ ПОТЕРЯНЫ):
```bash
docker compose down -v
```

### Просмотр логов

```bash
docker compose logs -f
```

Для просмотра сгенерированной публичной ссылки (при запуске с `--profile tunnel`):
```bash
docker compose logs cloudflared | grep trycloudflare
```

### Резервное копирование

Инструкции по автоматическому созданию, проверке, ротации и безопасному восстановлению: [docs/backups.md](docs/backups.md).

## 🤖 Continuous Integration (GitHub Actions)

Проект использует GitHub Actions для автоматической проверки каждого Pull Request и коммитов в ветку `main`. 
Запуск CI также можно инициировать вручную (workflow_dispatch) на вкладке Actions.

### Выполняемые проверки (Jobs)

- **CI / Install and contract**: проверка неизменности `package-lock.json`, сборка общих пакетов, валидация схемы Prisma и контрактов Socket.IO.
- **CI / Backend**: запуск миграций в чистой временной БД, typecheck и юнит/интеграционные тесты бэкенда.
- **CI / Frontend**: линтинг (oxlint), typecheck, тесты (vitest) и production-сборка клиентской части.
- **CI / Docker smoke**: полная сборка Docker-образов, запуск контейнеров с безопасными тестовыми env-переменными, healthcheck-проверки и проверка конфигурации портов.
- **CI / Accessibility**: автоматизированные тесты доступности интерфейса (A11y, Keyboard-only) с помощью Playwright.

> **Важно**: CI выполняет только проверки и **не осуществляет деплой** проекта (Continuous Deployment) и публикацию Docker-образов.

### Локальный запуск проверок

Чтобы воспроизвести основные CI-шаги локально перед отправкой коммита, выполните команду из корня:
```bash
npm run ci
```
Эта команда последовательно запустит `lint`, `typecheck`, `test` и `build` во всех workspaces.

Для локальной проверки `docker-smoke` выполните сборку и запуск Docker Compose с тестовыми `.env` переменными:
```bash
docker compose build && docker compose up -d
curl http://localhost/api/health
docker compose down --remove-orphans
```

### Настройка Branch Protection

Для максимальной надежности в настройках репозитория на GitHub (Settings -> Branches -> Branch protection rules для `main`) необходимо включить следующие опции:
1. **Require status checks to pass before merging**
2. Включить опцию **Require branches to be up to date before merging**
3. Добавить в список обязательных проверок (Status checks that are required):
   - `CI / Install and contract`
   - `CI / Backend`
   - `CI / Frontend`
   - `CI / Docker smoke`
   - `CI / Accessibility` (после настройки Playwright-задач)

Слияние (merge) PR будет заблокировано, пока все указанные проверки не завершатся успешно.
