# MVP Lockout Buzzer System

Платформа для quiz-show / TV-show формата, где телефоны участников заменяют физические кнопки-баззеры. Проект реализован как монорепозиторий (NPM Workspaces) с авторитетным бэкендом (Backend-authoritative).

## Технологии

- **Frontend:** React, Vite, TypeScript, PWA, CSS Modules/Vanilla
- **Backend:** Node.js, Express, Socket.IO, Prisma
- **Database:** PostgreSQL (только для аккаунтов хостов и подписок)
- **Deploy:** Docker, Docker Compose, Nginx (Reverse Proxy)

## Запуск локально для разработки

1. Установите зависимости:
   ```bash
   npm install
   ```

2. Настройте переменные окружения:
   ```bash
   cp .env.example .env
   # Отредактируйте .env (для локальной разработки достаточно оставить как есть, но для локального запуска базы данных нужен PostgreSQL, либо используйте Docker Compose для БД)
   ```

3. Запустите базу данных (PostgreSQL):
   Вы можете использовать `docker-compose up -d postgres` для запуска только базы данных.

4. Запустите миграции и сидирование (создание тестового хоста с подпиской):
   ```bash
   cd apps/backend
   npx prisma db push
   npm run db:seed
   ```

5. Запустите проект (backend и frontend):
   Вернитесь в корень проекта:
   ```bash
   cd ../../
   npm run dev
   ```
   * Frontend будет доступен на `http://localhost:5173`
   * Backend будет доступен на `http://localhost:3001`

## Деплой на VPS через Docker Compose

Для деплоя на сервере достаточно выполнить следующие шаги:

1. Склонируйте репозиторий на VPS.
2. Скопируйте `.env.example` в `.env` и настройте `VITE_API_URL` и `VITE_APP_PUBLIC_URL` (например, укажите ваш IP или домен: `VITE_APP_PUBLIC_URL=http://<YOUR_IP>`).
3. Запустите сборку и развертывание:
   ```bash
   docker-compose up --build -d
   ```
4. Зайдите в контейнер бекенда и выполните сидирование БД (опционально, если нужно создать админа):
   ```bash
   docker-compose exec backend npx prisma db push
   docker-compose exec backend npm run db:seed
   ```
5. Проект будет доступен по порту 80 (например, `http://<YOUR_IP>`).

## Учетные данные по умолчанию (после сидирования)

- **Email:** admin@example.com
- **Password:** admin123

## Ограничения MVP

- Нет регистрации обычных участников (только по QR / ссылке).
- Максимум 8 участников в одной комнате (ограничение задано в коде Socket-сервера).
- Нет сохранения истории раундов и очков.
- Подписки активируются вручную через сидирование (`npm run db:seed`).

## Дальнейшие шаги (Roadmap)

- [ ] Интеграция с реальной платежной системой.
- [ ] Оптимизация задержки через WebRTC data channels (гибридный транспорт).
- [ ] Поддержка нескольких комнат одним хостом (по желанию).
