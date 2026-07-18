# Profile and Session Hardening Design

## Goal

Protect profile email and password changes while preserving registration and existing host session behavior.

## Email and profile validation

`normalizeEmail(value)` accepts only strings, trims whitespace, lowercases the value, rejects values over 254 characters and rejects invalid email syntax. Registration, login, and profile update use it.

New and updated emails are stored in lowercase. Login first normalizes its input and finds a matching user with a parameterized case-insensitive lookup so a pre-existing mixed-case email remains usable. Registration and email update also catch Prisma unique-constraint errors, which closes the race between a preflight lookup and a concurrent write.

`normalizeName(value)` accepts a string or explicit `null`; it trims strings, turns an empty string into `null`, and rejects all other types and strings over 80 characters. Only its result reaches Prisma.

## Sensitive operations

`PUT /api/auth/me` remains the profile endpoint. A name-only update needs no password. A real normalized-email change requires `currentPassword`; the server compares it with bcrypt before changing the email.

`POST /api/auth/change-password` accepts `currentPassword` and `newPassword`. It requires strings, validates the 8--128 character range, rejects equality with the current password, verifies the current password, and stores a bcrypt hash.

Each successful sensitive operation updates the user value and revokes all non-current, non-revoked sessions in one Prisma transaction. The current JWT remains valid because it already contains the current `userId` and `sessionId`.

## Session propagation

The transaction returns the IDs of revoked sessions. After it commits, the auth router emits a typed `host_sessions_revoked` event. Socket.IO disconnects sockets belonging to those IDs without setting the intentional-logout marker. Their normal disconnect/reconnect lifecycle remains responsible for rooms; the current session is not selected.

## Rate limiting

A dedicated limiter covers attempts that actually verify a current password. Its key combines the authenticated session or user identity with the trusted request IP, it allows five failed attempts in fifteen minutes, and it skips successful requests. Name-only updates never enter it.

## Frontend

The existing profile dialog remains in place. It sends an email only when its normalized value differs from the loaded email, shows the current-password field only then, and clears it after success. A compact password-change form has current, new, and confirmation fields, loading and feedback states, and clears password fields after success.

## Verification

Backend tests cover normalization, legacy login, duplicate and concurrent email handling, profile validation, password rules, atomic rollback, session revocation, and rate limiting. Socket.IO tests assert revoked sessions disconnect while the current socket remains connected and room lifecycle is preserved. Frontend tests cover conditional requests, password clearing, and feedback. The required repository, Docker configuration, and focused tests run before commit and push.
