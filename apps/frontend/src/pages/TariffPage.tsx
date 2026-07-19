import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '../components/Footer';

export function TariffPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <Target className="w-6 h-6 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-black text-slate-800">КвизПульт</span>
          </Link>
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-slate-900">Вход</Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1">
        <section className="max-w-7xl mx-auto px-6 py-14 sm:py-20 grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-primary mb-3">Доступ ведущего</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">Доступ к сервису «КвизПульт»</h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl">Полный доступ ко всем функциям ведущего для проведения интерактивных викторин без физических кнопок.</p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 text-slate-700">
              {[
                'Создание и проведение игр',
                'Подключение участников по коду',
                'Определение первого нажавшего',
                'Управление раундами и баллами',
                'История игр и настройка оформления',
                'Без отдельных лимитов на игры и участников',
              ].map((feature) => (
                <div key={feature} className="flex gap-3 border-t border-slate-200 pt-4">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="border border-slate-200 bg-white rounded-xl p-6 sm:p-8 shadow-lg shadow-slate-200/50">
            <p className="text-sm font-semibold text-primary">Тариф</p>
            <p className="mt-3 text-4xl font-extrabold text-slate-900">500 ₽ за 30 дней</p>
            <p className="mt-6 text-sm text-slate-600 leading-relaxed">Без автоматического продления. Следующий период оплачивается самостоятельно.</p>
            <p className="mt-3 text-sm font-semibold text-primary leading-relaxed">На период тестирования доступ можно активировать бесплатно один раз на 30 дней.</p>
            <Link to="/register" className="block mt-7">
              <Button size="lg" className="w-full">Получить доступ</Button>
            </Link>
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">После регистрации бесплатная активация доступна в кабинете ведущего.</p>
          </aside>
        </section>
      </main>

      <Footer />
    </div>
  );
}
