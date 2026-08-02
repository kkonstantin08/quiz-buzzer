import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { COOKIE_PREFERENCES_CHANGED_EVENT, getCookiePreferences } from '@/lib/cookieNoticeStorage';

const SCRIPT_ID = 'yandex-metrika-script';
type YmQueue = ((id: string, method: string, ...args: unknown[]) => void) & { a?: IArguments[]; l?: number };

declare global {
  interface Window {
    ym?: YmQueue;
  }
}

function counterId() {
  const id = import.meta.env.VITE_YANDEX_METRIKA_ID?.trim();
  return id && /^\d+$/.test(id) ? id : null;
}

function ensureQueue(): YmQueue {
  if (!window.ym) {
    const queue: YmQueue = function (..._args: unknown[]) { (queue.a ??= []).push(arguments); };
    queue.l = Date.now();
    window.ym = queue;
  }
  return window.ym;
}

export function YandexMetrika() {
  const { pathname } = useLocation();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => getCookiePreferences()?.categories.analytics === true);
  const activeRef = useRef(false);
  const lastHitRef = useRef<string | null>(null);
  const trackingAllowed = analyticsAllowed && pathname !== '/forgot-password' && pathname !== '/reset-password';

  useEffect(() => {
    const updatePreferences = () => setAnalyticsAllowed(getCookiePreferences()?.categories.analytics === true);
    window.addEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
    return () => window.removeEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
  }, []);

  useEffect(() => {
    const id = counterId();
    if (!id) return;
    if (!trackingAllowed) {
      if (activeRef.current) ensureQueue()(id, 'destruct');
      activeRef.current = false;
      lastHitRef.current = null;
      return;
    }

    const ym = ensureQueue();
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = 'https://mc.yandex.ru/metrika/tag.js';
      document.head.appendChild(script);
    }
    if (!activeRef.current) {
      ym(id, 'init', { defer: true, clickmap: true, trackLinks: true });
      activeRef.current = true;
    }
  }, [trackingAllowed]);

  useEffect(() => {
    const id = counterId();
    if (!id || !trackingAllowed || !activeRef.current || lastHitRef.current === pathname) return;
    ensureQueue()(id, 'hit', pathname);
    lastHitRef.current = pathname;
  }, [pathname, trackingAllowed]);

  return null;
}
