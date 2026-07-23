import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie } from 'lucide-react';
import { Link } from 'react-router-dom';
import { acknowledgeCookieNotice, OPEN_COOKIE_SETTINGS_EVENT, shouldShowCookieNotice } from '@/lib/cookieNoticeStorage';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (shouldShowCookieNotice()) {
      // Small delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const showSettings = () => setIsVisible(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, showSettings);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, showSettings);
  }, []);

  const saveChoice = (analytics: boolean) => {
    acknowledgeCookieNotice(analytics);
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          role="dialog"
          aria-labelledby="cookie-banner-title"
          aria-describedby="cookie-banner-description"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[100] bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-6 flex flex-col gap-4 items-center text-center"
        >
          <div className="bg-red-100 p-3 rounded-full shrink-0 mt-1">
            <Cookie size={24} className="text-red-500" />
          </div>
          <div>
            <h3 id="cookie-banner-title" className="font-semibold text-base mb-1.5 text-slate-900">Настройки cookie</h3>
            <p id="cookie-banner-description" className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-2">
              Мы используем обязательные технические cookie для авторизации, безопасности и работы сервиса. С вашего разрешения мы также будем использовать Яндекс Метрику для анализа посещаемости.
            </p>
            <p className="text-xs text-slate-500">
              Подробнее — в <Link to="/cookies" className="text-primary hover:underline">Политике Cookie</Link>.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => saveChoice(false)}
              className="w-full"
            >
              Только необходимые
            </Button>
            <Button
              onClick={() => saveChoice(true)}
              className="w-full shadow-md shadow-primary/20"
            >
              Разрешить аналитику
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
