import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Target, Zap, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '../components/Footer';
import { useDocumentMetadata } from '../lib/useDocumentMetadata';

export function TariffPage() {
  useDocumentMetadata('Доступ к сервису «КвизПульт» | КвизПульт', 'Условия доступа к сервису «КвизПульт»: 500 ₽ за 30 дней без автоматического продления.');

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />

      <header className="relative z-10 border-b border-slate-200/50 bg-white/80 backdrop-blur-md">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 h-16 sm:h-20 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md group">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <Target className="w-6 h-6 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-xl font-black text-slate-800 tracking-tight group-hover:text-primary transition-colors">КвизПульт</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/login">
              <Button variant="ghost" className="hidden sm:flex text-slate-600 hover:text-slate-900 font-medium">
                Вход
              </Button>
            </Link>
            <Link to="/register">
              <Button className="font-bold shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all">
                Создать игру
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 relative z-10">
        <section className="max-w-4xl mx-auto px-6 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Единый тариф для ведущих</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
            Проводите квизы <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-500">
              без физических кнопок
            </span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            «КвизПульт» — онлайн-сервис для интерактивных викторин. Ведущий создаёт комнату, а участники подключаются со смартфонов через браузер без установки приложения.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-20 sm:pb-32 grid lg:grid-cols-2 gap-8 items-center">

          {/* Pricing Card */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-[2rem] p-8 sm:p-10 shadow-2xl shadow-slate-200/50 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Доступ к сервису «КвизПульт»</h3>
                  <p className="text-slate-500 mt-1">Полный доступ ко всем функциям ведущего</p>
                </div>
              </div>

              <p className="mb-8 text-5xl sm:text-6xl font-black text-slate-900 tracking-tight">500 ₽ за 30 дней</p>

              <Link to="/register" className="block mb-8">
                <Button size="lg" className="w-full h-14 text-lg shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all">
                  Начать бесплатно 30 дней
                </Button>
              </Link>

              <div className="space-y-4 flex-1">
                {[
                  'Создание и проведение игр',
                  'Подключение участников по QR-коду и пин-коду',
                  'Высокоточное определение первого нажавшего',
                  'Управление раундами и начисление баллов',
                  'Кастомизация внешнего вида игровой комнаты',
                  'Детальная история проведенных игр',
                ].map((feature) => (
                  <div key={feature} className="flex gap-3">
                    <div className="mt-1 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-green-600" strokeWidth={3} />
                    </div>
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* FAQ / Info */}
          <div className="flex flex-col gap-6 lg:pl-10 mt-10 lg:mt-0">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 mb-1">Без скрытых списаний</h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Без автоматического продления. Следующий период оплачивается самостоятельно.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 mb-1">Условия и ограничения</h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Отдельные тарифные лимиты на количество игр и участников не установлены. Для стабильности и безопасности могут применяться разумные технические ограничения.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 mb-1">Мгновенная активация</h4>
                <p className="text-sm text-slate-600 leading-relaxed">
                  На период тестирования доступ можно активировать бесплатно один раз на 30 дней.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed mt-2">Платный доступ открывается автоматически сразу после подтверждения оплаты.</p>
              </div>
            </div>
          </div>

        </section>
      </main>

      <Footer />
    </div>
  );
}
