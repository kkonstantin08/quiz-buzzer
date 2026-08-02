# Production deployment and rollback

Этот runbook описывает production deployment без удаления SQLite/uploads volumes. Он не заменяет code review и отдельное разрешение на restore.

## Неподвижные production-инварианты

- Compose project: `quiz-buzzer`.
- Direct TLS nginx слушает 80/443 и хранится только на сервере вместе с Compose override.
- Существующие Let's Encrypt mounts и сертификаты сохраняются.
- SQLite и uploads используют persistent volumes; backend-порт наружу не публикуется.
- `REGISTRATION_ENABLED=true`, `PAYMENTS_ENABLED=false`.
- `down -v`, `docker volume rm`, `prisma migrate reset`, `prisma db push` и автоматический restore запрещены.
- Repository `nginx/nginx.conf` обслуживает local HTTP и доверенный Cloudflare Tunnel; direct TLS config не копируется в Git.

## Compose v2 prerequisite

Установите официальный Docker Compose CLI plugin. Предпочтителен пакет `docker-compose-plugin` из официального Docker repository. Если repository предлагает другой major, используйте pinned официальный v2 release asset и его `.sha256`; не используйте `curl | sh`.

Не удаляйте standalone `docker-compose` v1, пока v2 не прошёл isolated smoke. Проверка repository guard:

```bash
./scripts/compose.sh version
docker version
docker compose ls
```

`scripts/compose.sh` принимает только `2.x` и передаёт каждому вызову `--project-name "${COMPOSE_PROJECT_NAME:-quiz-buzzer}"`.

Первый recreate выполняйте только в отдельном project `quiz-buzzer-compose-v2-smoke`: отдельные container/network/storage, без public ports и без production volumes. Проверьте новый container ID после recreate, сохранность marker, health и rollback к прежнему image/tag. Завершите `docker compose down --remove-orphans` без `-v` и удалите только изолированное test storage разрешённым способом.

После isolated success production разрешены read-only проверки:

```bash
export COMPOSE_PROJECT_NAME=quiz-buzzer
export COMPOSE_FILE=<server-only-compose-file>
export COMPOSE_ENV_FILES=<production-env-file>
./scripts/compose.sh config --quiet
./scripts/compose.sh ps --all
./scripts/compose.sh images
```

Получайте фактический server-only config chain из labels работающего container, а не угадывайте путь. Не печатайте полный rendered config: substituted values могут содержать secrets.

## 1. Inventory и ресурсы

```bash
docker version
./scripts/compose.sh version
./scripts/compose.sh config --quiet
./scripts/compose.sh ps --all
./scripts/compose.sh images
df -h
docker system df
```

Подтвердите, что backend healthy, нужные volumes смонтированы в `/app/prisma` и `/app/uploads`, а на диске достаточно места для backup и новых images.

## 2. Target SHA

Работайте из отдельного clean checkout:

```bash
git status --porcelain
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
```

Оба SHA должны совпадать с разрешённым target commit. Не используйте `git reset --hard`.

## 3. Rollback image tags

До build сохраните текущие image IDs под уникальными tags:

```bash
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker image tag "$(./scripts/compose.sh images -q backend)" "quiz-buzzer_backend:rollback-$stamp"
docker image tag "$(./scripts/compose.sh images -q frontend)" "quiz-buzzer_frontend:rollback-$stamp"
docker image tag "$(./scripts/compose.sh images -q nginx)" "quiz-buzzer_nginx:rollback-$stamp"
```

Запишите tags в приватный operator log. Не перезаписывайте их до post-deploy smoke.

## 4. Validated backup до build и migrations

```bash
./scripts/backup.sh
```

Не продолжайте, пока новый archive не пуст, соседний `.sha256` проходит `sha256sum -c`, а archive содержит `database.sqlite`, `uploads/` и `metadata.json`. Retention не удаляет emergency backups. Подробности: [backups.md](backups.md).

## 5. Production override preflight

`./scripts/compose.sh config --quiet` должен пройти с exact server-only override. Проверьте без вывода secrets:

- ports 80/443 и direct TLS nginx;
- существующие Let's Encrypt mounts;
- external SQLite/uploads volume names;
- backend без published port;
- `REGISTRATION_ENABLED=true`, `PAYMENTS_ENABLED=false`;
- secure cookie и canonical production CORS origin.

Direct TLS nginx является единственным владельцем HSTS. В HTTPS server нужны:

```nginx
proxy_hide_header Strict-Transport-Security;
add_header Strict-Transport-Security "max-age=86400" always;
```

Повторите `add_header` в `/uploads/`, потому что собственный `add_header Cross-Origin-Resource-Policy` отключает наследование server-level headers. HTTP redirect не должен добавлять HSTS. На первом этапе не используйте `includeSubDomains` и `preload`.

Перед reload сохраните server-only config, проверьте candidate и live config через `nginx -t`, затем используйте `nginx -s reload`; recreate nginx для одного header не требуется.

## 6. Build без остановки текущих containers

```bash
./scripts/compose.sh build backend frontend
```

Build failure завершает deployment: работающие containers и volumes не меняются.

## 7. Prisma status и deploy

Сначала проверьте migration state новым backend image:

```bash
./scripts/compose.sh run --rm --no-deps --entrypoint npx backend prisma migrate status
./scripts/compose.sh run --rm --no-deps --entrypoint npx backend prisma migrate deploy
```

Legacy production database уже baselined: migration `20260711110449_init` отмечена applied в `_prisma_migrations`, а последующие migrations применены через `migrate deploy`. Не запускайте `migrate resolve --applied 20260711110449_init` повторно. Для новой пустой базы init migration применяется обычным `migrate deploy`. При любом расхождении остановитесь; не используйте reset/db push.

## 8. Recreate Compose v2

```bash
./scripts/compose.sh up -d --no-build --no-deps backend frontend nginx
./scripts/compose.sh ps --all
```

Не выполняйте `down`. Дождитесь backend `healthy` и стабильного состояния всех трёх services.

## 9. Public smoke и логи

```bash
curl --fail https://qbuz.ru/api/health
curl -I https://qbuz.ru/
curl -I https://qbuz.ru/api/health
curl -I https://qbuz.ru/uploads/nonexistent.png
./scripts/compose.sh logs --since=15m backend frontend nginx
```

Health должен вернуть `status=ok` и `database=connected`. На каждом HTTPS path должен быть ровно один `Strict-Transport-Security: max-age=86400`; HTTP redirect — без HSTS. Проверьте login, room creation, Socket.IO connect и отсутствие 5xx/Prisma/SQLite errors.

## 10. Rollback

Rollback не удаляет volumes и не восстанавливает backup автоматически.

1. Укажите в server-only image override сохранённые `rollback-<stamp>` tags для backend/frontend/nginx.
2. Выполните `./scripts/compose.sh config --quiet`.
3. Выполните `./scripts/compose.sh up -d --no-build --no-deps backend frontend nginx`.
4. Дождитесь health и повторите public smoke/log review.

Если новая migration несовместима со старыми images, остановитесь и запросите отдельное решение. Restore backup поверх production требует отдельного подтверждения и выполняется только по [backups.md](backups.md); не связывайте restore с автоматическим image rollback.
