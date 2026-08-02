# Password Reset via Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement safe password recovery through Resend for host accounts.

**Architecture:** Persist only a SHA-256 reset-token hash and use a conditional transactional claim to make the token single-use. Keep password validation, session revocation, cookies, API client, and page styling aligned with existing auth patterns.

**Tech Stack:** Express, Prisma/SQLite, bcrypt, Node crypto, Resend SDK, React, Vitest/Jest.

## Global Constraints

- Link issue #53 and work only on `53-password-reset-resend`.
- Never log or persist a raw reset token, password, hash, or API key.
- Use a neutral forgot-password response for every email outcome.
- Mock Resend; no real email is sent by tests.
- Do not create or merge a PR.

---

### Task 1: Database, configuration, and backend contract

**Files:** schema/migration, backend config, auth router, focused backend tests.

- [ ] Write failing backend tests for neutral responses, no raw token persistence, expiry, reuse, session revocation, and cookie clearing.
- [ ] Run the focused backend test and verify it fails for absent routes/model.
- [ ] Add `PasswordResetToken`, generate the Prisma migration, validate configuration, install `resend`, and implement the smallest transactional endpoints and email sender.
- [ ] Run the focused backend test and verify it passes.

### Task 2: Recovery interface

**Files:** auth page/API client/routes, focused frontend tests.

- [ ] Write failing frontend tests for the recovery link, request success, invalid token state, and login redirect.
- [ ] Run the focused frontend test and verify it fails because the pages/routes are absent.
- [ ] Add minimal forgot/reset pages using the existing auth visual primitives and API client.
- [ ] Run the focused frontend test and verify it passes.

### Task 3: Deployment guidance and verification

**Files:** `.env.example`, Compose configuration, README, tests and generated Prisma artifacts.

- [ ] Document required environment values, Resend API-key creation, and additive DNS verification at REG.RU.
- [ ] Run Prisma validation, lint, typecheck, relevant tests, build, Docker configuration/smoke checks, and `git diff --check`.
- [ ] Inspect generated artifacts, commit the scoped files, push `53-password-reset-resend`, and do not create a PR.
