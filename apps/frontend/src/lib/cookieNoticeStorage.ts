export const COOKIE_NOTICE_STORAGE_KEY = "quiz_cookie_notice_acknowledgement";
export const COOKIE_NOTICE_VERSION = "1.0";
const LEGACY_COOKIE_NOTICE_STORAGE_KEY = "cookieConsent";

type CookieNoticeAcknowledgement = {
  noticeVersion: string;
  acknowledgedAt: string;
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isCurrentAcknowledgement(value: unknown): value is CookieNoticeAcknowledgement {
  return typeof value === "object" && value !== null
    && (value as CookieNoticeAcknowledgement).noticeVersion === COOKIE_NOTICE_VERSION
    && isIsoDate((value as CookieNoticeAcknowledgement).acknowledgedAt);
}

export function shouldShowCookieNotice(): boolean {
  localStorage.removeItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
  const stored = localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY);
  if (!stored) return true;

  try {
    return !isCurrentAcknowledgement(JSON.parse(stored));
  } catch {
    return true;
  }
}

export function acknowledgeCookieNotice(): void {
  localStorage.removeItem(LEGACY_COOKIE_NOTICE_STORAGE_KEY);
  localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, JSON.stringify({
    noticeVersion: COOKIE_NOTICE_VERSION,
    acknowledgedAt: new Date().toISOString(),
  }));
}
