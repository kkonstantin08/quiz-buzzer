export const COOKIE_NOTICE_STORAGE_KEY = "quiz_cookie_notice_acknowledgement";
export const COOKIE_NOTICE_VERSION = "1.0";
export const COOKIE_PREFERENCES_CHANGED_EVENT = "quiz:cookie-preferences-changed";
export const OPEN_COOKIE_SETTINGS_EVENT = "quiz:open-cookie-settings";
const LEGACY_COOKIE_NOTICE_STORAGE_KEY = "cookieConsent";

export type CookiePreferences = {
  noticeVersion: string;
  decidedAt: string;
  categories: {
    necessary: true;
    analytics: boolean;
  };
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isCurrentPreferences(value: unknown): value is CookiePreferences {
  return typeof value === "object" && value !== null
    && (value as CookiePreferences).noticeVersion === COOKIE_NOTICE_VERSION
    && isIsoDate((value as CookiePreferences).decidedAt)
    && (value as CookiePreferences).categories?.necessary === true
    && typeof (value as CookiePreferences).categories?.analytics === "boolean";
}

export function getCookiePreferences(): CookiePreferences | null {
  const stored = localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY);
  if (!stored) return null;

  try {
    const preferences = JSON.parse(stored);
    return isCurrentPreferences(preferences) ? preferences : null;
  } catch {
    return null;
  }
}

export function shouldShowCookieNotice(): boolean {
  localStorage.removeItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
  return getCookiePreferences() === null;
}

export function acknowledgeCookieNotice(analytics = false): void {
  localStorage.removeItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
  localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, JSON.stringify({
    noticeVersion: COOKIE_NOTICE_VERSION,
    decidedAt: new Date().toISOString(),
    categories: { necessary: true, analytics },
  }));
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_CHANGED_EVENT));
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
