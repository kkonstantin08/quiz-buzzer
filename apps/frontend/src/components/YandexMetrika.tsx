import { useEffect, useState } from 'react';
import { COOKIE_PREFERENCES_CHANGED_EVENT, getCookiePreferences } from '@/lib/cookieNoticeStorage';

const SCRIPT_ID = 'yandex-metrika-script';

declare global {
  interface Window {
    ym?: (id: string, method: string, options: Record<string, boolean>) => void;
  }
}

export function YandexMetrika() {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => getCookiePreferences()?.categories.analytics === true);

  useEffect(() => {
    const updatePreferences = () => setAnalyticsAllowed(getCookiePreferences()?.categories.analytics === true);
    window.addEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
    return () => window.removeEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
  }, []);

  useEffect(() => {
    const metrikaId = import.meta.env.VITE_YANDEX_METRIKA_ID?.trim();
    const existingScript = document.getElementById(SCRIPT_ID);

    if (!metrikaId || !analyticsAllowed) {
      existingScript?.remove();
      return;
    }

    if (existingScript) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    script.onload = () => window.ym?.(metrikaId, 'init', { clickmap: true, trackLinks: true });
    document.head.appendChild(script);

    return () => script.remove();
  }, [analyticsAllowed]);

  return null;
}
