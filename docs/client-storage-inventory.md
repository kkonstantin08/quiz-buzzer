# Client storage inventory

Инвентаризация описывает исполняемый код и конфигурацию на момент изменения. Это технический реестр, а не юридическая оценка.

## Browser storage

| Имя | Файлы использования | Содержимое и назначение | Создание, чтение и удаление | Срок | Обязателен для работы |
| --- | --- | --- | --- | --- | --- |
| `quiz_cookie_notice_acknowledgement` | `apps/frontend/src/lib/cookieNoticeStorage.ts`, `apps/frontend/src/components/CookieBanner.tsx` | JSON: `{ noticeVersion, acknowledgedAt }`. Отмечает показанное пользователю уведомление. | Создаётся кнопкой «Понятно» или крестиком. Читается при монтировании banner; повреждённая или старая версия показывает banner снова. Явного срока и удаления нет. | До очистки browser storage; версия уведомления инвалидирует старую запись. | Нет: влияет только на показ уведомления. |
| `cookieConsent` (устаревший) | `apps/frontend/src/lib/cookieNoticeStorage.ts` | Старый строковый флаг `true`; более не используется как подтверждение. | Безопасно удаляется при проверке и сохранении нового подтверждения. | Не применяется. | Нет. |
| `quiz_participant_<roomCode>` | `apps/frontend/src/lib/participantSessionStorage.ts`, `apps/frontend/src/pages/ParticipantRoom.tsx` | JSON: `{ participantId, reconnectToken, createdAt, expiresAt }`. Позволяет участнику восстановиться после обновления страницы или краткого обрыва. | Создаётся после успешного `ROOM_JOIN`; читается для `PARTICIPANT_REJOIN`; неполная, повреждённая, устаревшая или просроченная запись удаляется. Также удаляется после неуспешного rejoin, `ROOM_CLOSED` и `PARTICIPANT_CONTROL_REVOKED`. | 24 часа от создания — тот же максимум, что в backend `scheduleMaxLifetimeCleanup`. | Нет для нового подключения; нужен для автоматического восстановления участника. |

`sessionStorage` и `document.cookie` в исполняемом frontend-коде не используются.

## Server-set cookie

| Имя | Файлы использования | Содержимое и назначение | Создание, чтение и удаление | Срок | Обязателен для работы |
| --- | --- | --- | --- | --- | --- |
| `hostToken` | `apps/backend/src/auth/index.ts`, `apps/backend/src/auth/middleware.ts`, `apps/backend/src/auth/session.ts`, `apps/backend/src/realtime/index.ts` | Подписанный JWT с `userId` и `sessionId`; браузерный JavaScript его не читает (`httpOnly`). Используется для авторизации ведущего в REST и Socket.IO вместе с server-side Session. | Устанавливается при login и registration через `res.cookie`; читается сервером из cookie-заголовка; очищается при logout и `clear-session` через `res.clearCookie`. | 7 дней; server-side Session может отозвать доступ раньше. | Да, для аутентифицированных действий ведущего; не нужен участнику. |

## External runtime resources

В tracked runtime-исходниках не обнаружены сторонние `<script>`, iframe, аналитика или рекламные SDK, а также CDN-загрузки. `apps/frontend/index.html` загружает только локальный модуль `/src/main.tsx`; зависимости frontend собираются в приложение. В реестре нет сторонних cookie или browser-storage ключей.
