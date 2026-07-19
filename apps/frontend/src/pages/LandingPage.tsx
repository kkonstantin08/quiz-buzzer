import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Target, Rocket, QrCode, Crown } from 'lucide-react';
import { Footer } from '../components/Footer';

const LogoIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
    <Target className="w-6 h-6 text-white" strokeWidth={2.5} />
  </div>
);

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50 transition-all duration-300">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex justify-between items-center h-16 sm:h-20">
            <div className="flex items-center gap-2 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} tabIndex={0}>
              <LogoIcon />
              <span className="text-xl font-black text-slate-800 tracking-tight group-hover:text-primary transition-colors">КвизПульт</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <Button variant="ghost" className="hidden sm:flex text-slate-600 hover:text-slate-900 font-medium" onClick={() => navigate('/login')}>
                Вход
              </Button>
              <Button className="font-bold shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all" onClick={() => navigate('/register')}>
                Создать игру
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-7xl mx-auto px-6 pt-24 pb-12 lg:pt-24 lg:pb-8 grid lg:grid-cols-2 gap-8 lg:gap-4 items-center relative">
        {/* Left Column: Text */}
        <div className="space-y-4 lg:space-y-6 relative z-10 text-center lg:text-left">
          <div className="max-w-2xl mx-auto lg:mx-0 space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
              Выведите свои квизы на новый уровень
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Новый стандарт для квизов. Гости сканируют QR-код, и их телефоны превращаются в высокоточные игровые пульты.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-base h-12 px-8 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-shadow">
                Организовать игру
              </Button>
            </Link>
          </div>
          <Link to="/tariff" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-primary transition-colors">
            Доступ ведущего: 500 ₽ / 30 дней
            <ArrowRight size={16} />
          </Link>

          <div className="pt-4 lg:pt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mx-auto lg:mx-0">
            {/* Card 1 */}
            <div className="bg-white rounded-[1.5rem] p-5 xl:p-6 shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col items-center sm:items-start text-center sm:text-left transition-transform hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600 flex items-center justify-center shadow-inner mb-4">
                <Rocket className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Мгновенная реакция</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Сигнал доходит за миллисекунды без задержек.</p>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-[1.5rem] p-5 xl:p-6 shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col items-center sm:items-start text-center sm:text-left transition-transform hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 flex items-center justify-center shadow-inner mb-4">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Без скачиваний</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Игрокам нужен только браузер и камера.</p>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-[1.5rem] p-5 xl:p-6 shadow-lg shadow-slate-200/50 border border-slate-100 flex flex-col items-center sm:items-start text-center sm:text-left transition-transform hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-600 flex items-center justify-center shadow-inner mb-4">
                <Crown className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900 mb-1">Авто-победитель</h3>
              <p className="text-xs text-slate-500 leading-relaxed">Система сама определяет, кто нажал первым.</p>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Mockup */}
        <div className="relative hidden lg:flex justify-center lg:justify-center lg:-mr-12 items-center h-full max-h-full">
          {/* Subtle background decoration (no neon) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center -translate-y-10">
            <div className="absolute w-[400px] h-[400px] bg-blue-200/40 rounded-full mix-blend-multiply blur-[80px] translate-x-10 -translate-y-10"></div>
            <div className="absolute w-[300px] h-[300px] bg-red-200/40 rounded-full mix-blend-multiply blur-[80px] -translate-x-10 translate-y-20"></div>

            {/* Floating geometric confetti - properly scattered around */}
            <div className="hidden md:block absolute top-[10%] left-[5%] md:left-[15%] w-8 h-8 rounded-full bg-yellow-300 opacity-70 animate-bounce" style={{ animationDuration: '3s' }}></div>
            <div className="hidden md:block absolute bottom-[25%] left-[2%] md:left-[10%] w-6 h-6 rounded-lg bg-blue-300 opacity-70 transform rotate-45 animate-pulse" style={{ animationDuration: '4s' }}></div>
            <div className="hidden md:block absolute top-[20%] right-[5%] md:right-[15%] w-10 h-10 rounded-full bg-red-300 opacity-60 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '3.5s' }}></div>
            <div className="hidden md:block absolute bottom-[15%] right-[2%] md:right-[10%] w-7 h-7 rounded-full bg-green-300 opacity-70 animate-pulse" style={{ animationDelay: '1s', animationDuration: '2.5s' }}></div>
            <div className="hidden md:block absolute top-[50%] left-[8%] md:left-[20%] w-4 h-4 rounded bg-purple-300 opacity-60 transform rotate-12 animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '4s' }}></div>
            <div className="hidden md:block absolute top-[60%] right-[8%] md:right-[20%] w-5 h-5 rounded-full bg-orange-300 opacity-60 animate-pulse" style={{ animationDelay: '0.2s', animationDuration: '3s' }}></div>
          </div>

          {/* 3D Smartphone Mockup (CSS) */}
          <div className="relative w-[280px] sm:w-[320px] h-[580px] sm:h-[600px] bg-slate-900 rounded-[3rem] shadow-[2px_2px_0_#334155,4px_4px_0_#334155,6px_6px_0_#1e293b,8px_8px_0_#1e293b,10px_10px_0_#0f172a,12px_12px_0_#0f172a,14px_14px_0_#0f172a,-20px_40px_60px_rgba(0,0,0,0.4)] border-[6px] border-slate-800 p-2 z-10 animate-float-angled transform-gpu mb-4 scale-95 origin-center">
            {/* Notch */}
            <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-30">
              <div className="w-32 h-6 bg-slate-800 rounded-b-2xl shadow-inner"></div>
            </div>

            {/* Volume/Power Buttons on side */}
            <div className="absolute top-32 -right-3 w-1.5 h-12 bg-slate-700 rounded-r-md"></div>
            <div className="absolute top-48 -right-3 w-1.5 h-12 bg-slate-700 rounded-r-md"></div>
            <div className="absolute top-40 -left-3 w-1.5 h-16 bg-slate-700 rounded-l-md"></div>

            {/* Phone Screen Container */}
            <div className="w-full h-full bg-slate-50 rounded-[2.25rem] overflow-hidden flex flex-col relative shadow-inner">

              {/* Fake Status Bar */}
              <div className="h-7 w-full flex items-center justify-between px-6 pt-1 text-[10px] font-medium text-slate-800">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-2.5 bg-slate-800 rounded-sm"></div>
                  <div className="w-4 h-2.5 bg-slate-800 rounded-sm"></div>
                </div>
              </div>

              {/* Fake Header inside phone */}
              <div className="h-14 bg-white border-b flex items-center justify-center relative shadow-sm">
                <span className="font-bold text-slate-800 text-lg">Вы: Игрок 1</span>
                <div className="absolute right-4 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-600 font-bold">1</div>
              </div>

              {/* Button Area */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-10 bg-gradient-to-b from-slate-50 to-slate-200">
                <div className="relative">
                  {/* Outer ring */}
                  <div className="absolute -inset-4 bg-red-100 rounded-full animate-pulse opacity-50"></div>

                  {/* The Button */}
                  <div className="relative w-44 h-44 rounded-full bg-red-500 shadow-[0_15px_30px_rgba(239,68,68,0.4),_inset_0_-8px_20px_rgba(0,0,0,0.2),_inset_0_4px_10px_rgba(255,255,255,0.4)] flex items-center justify-center border-4 border-red-600 transition-transform active:scale-95 cursor-pointer">
                    <span className="text-white font-extrabold tracking-widest text-3xl relative z-20 drop-shadow-md">ЖМИ</span>

                    {/* Inner highlight for 3D effect */}
                    <div className="absolute top-2 w-3/4 h-1/3 bg-gradient-to-b from-white/30 to-transparent rounded-full opacity-50"></div>
                  </div>
                </div>

                <div className="text-center space-y-2">
                  <p className="text-xl font-bold text-slate-700">Ожидание вопроса...</p>
                  <p className="text-sm text-slate-600">Приготовьтесь нажать первым!</p>
                </div>
              </div>

              {/* Bottom bar indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
