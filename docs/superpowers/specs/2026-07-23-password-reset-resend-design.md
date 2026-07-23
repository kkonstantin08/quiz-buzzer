# Password Reset via Resend

## Goal

Let a host reset a forgotten password without revealing whether an email address belongs to an account.

## Design

`POST /api/auth/forgot-password` normalizes the supplied email and always returns the same Russian confirmation message unless the request is rate limited. The limiter applies a combined key of client IP and normalized email, and a separate IP-only limiter prevents an attacker from cycling addresses. A matched user receives a 32-byte random base64url token; only its SHA-256 hash is persisted. A new request invalidates that user's active reset tokens before storing the new one. The token expires after the validated configured TTL, defaulting to 30 minutes.

`POST /api/auth/reset-password` accepts a raw token and a new password. It uses one Prisma transaction to conditionally claim exactly one unexpired, unused token, update the bcrypt password hash, mark all remaining active reset tokens used, and revoke every active session. The route emits the existing session-revocation event and clears `hostToken`. Invalid, expired, and previously used tokens return one identical error.

Resend is called after the token is persisted. The SDK receives an escaped HTML link and a text alternative. Sending failures are logged without tokens, hashes, or addresses and keep the public confirmation response neutral. Production configuration requires the Resend key, sender, and public URL; tests supply safe values and mock the SDK.

The frontend adds focused forgot/reset pages that reuse the current card, form controls, footer, and accessibility conventions. The reset success route navigates to `/login` with the requested message.

## Tests

Backend integration tests cover neutral responses, both limiter keys, raw-token non-persistence, expiry, one-time/concurrent use, session revocation, cookie clearing, and mocked email delivery. Frontend component tests cover navigation, submit/loading/success/error states, validation, and successful reset redirect.
