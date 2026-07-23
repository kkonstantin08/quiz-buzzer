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
  const { pathname, search } = useLocation();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => getCookiePreferences()?.categories.analytics === true);
  const activeRef = useRef(false);
  const lastHitRef = useRef<string | null>(null);

  useEffect(() => {
    const updatePreferences = () => setAnalyticsAllowed(getCookiePreferences()?.categories.analytics === true);
    window.addEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
    return () => window.removeEventListener(COOKIE_PREFERENCES_CHANGED_EVENT, updatePreferences);
  }, []);

  useEffect(() => {
    const id = counterId();
    if (!id) return;
    if (!analyticsAllowed) {
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
  }, [analyticsAllowed]);

  useEffect(() => {
    const id = counterId();
    const url = `${pathname}${search}`;
    if (!id || !analyticsAllowed || !activeRef.current || lastHitRef.current === url) return;
    ensureQueue()(id, 'hit', url);
    lastHitRef.current = url;
  }, [analyticsAllowed, pathname, search]);

  return null;
}
