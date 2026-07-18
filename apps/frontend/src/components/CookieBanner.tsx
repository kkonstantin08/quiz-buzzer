import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { acknowledgeCookieNotice, shouldShowCookieNotice } from '@/lib/cookieNoticeStorage';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (shouldShowCookieNotice()) {
      // Small delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissBanner = () => {
    acknowledgeCookieNotice();
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
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[100] bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-6 flex flex-col gap-4 items-center text-center"
        >
          <button
            onClick={dismissBanner}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-full transition-colors"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
          <div className="bg-red-100 p-3 rounded-full shrink-0 mt-1">
            <Cookie size={24} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1.5 text-slate-900">Мы используем файлы cookie</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-2">
              Мы используем технические файлы cookie для работы сайта и обеспечения безопасности.
            </p>
            <p className="text-xs text-slate-500">
              Подробнее в нашей <Link to="/legal/cookies" className="text-primary hover:underline">Политике Cookie</Link>.
            </p>
          </div>
          <div className="flex w-full gap-2 mt-2">
            <Button
              onClick={dismissBanner}
              className="w-full shadow-md shadow-primary/20"
            >
              Понятно
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
