const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function normalizeEmail(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string') return { ok: false, error: 'Invalid email' };

  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_REGEX.test(email)) return { ok: false, error: 'Invalid email' };

  return { ok: true, value: email };
}

export function normalizeName(value: unknown): ValidationResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'Invalid name' };

  const name = value.trim();
  if (name.length > 80) return { ok: false, error: 'Invalid name' };

  return { ok: true, value: name || null };
}
