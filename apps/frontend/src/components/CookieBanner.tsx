import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie } from 'lucide-react';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      // Small delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookieConsent', 'true');
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
          <div className="bg-red-100 p-3 rounded-full shrink-0 mt-1">
            <Cookie size={24} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1.5 text-slate-900">Мы используем файлы cookie</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Мы используем файлы cookie, чтобы улучшить работу сайта и сделать его удобнее. Продолжая использовать сайт, вы соглашаетесь с этим.
            </p>
          </div>
          <Button 
            onClick={acceptCookies} 
            className="w-full sm:w-full mt-2 shadow-md shadow-primary/20"
          >
            Понятно
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
