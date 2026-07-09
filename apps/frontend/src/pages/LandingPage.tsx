import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Target } from 'lucide-react';

const LogoIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
    <Target className="w-6 h-6 text-white" strokeWidth={2.5} />
  </div>
);

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] overflow-x-hidden lg:overflow-hidden bg-slate-50 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between bg-white shadow-sm border-b relative z-20 shrink-0">
        <div className="flex items-center gap-3">
          <LogoIcon />
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">КвизПульт</h1>
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Войти
          </Link>
          <Link to="/register">
            <Button size="sm">Регистрация</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 lg:py-0 grid lg:grid-cols-2 gap-16 lg:gap-8 items-center relative lg:h-full">
        {/* Left Column: Text */}
        <div className="space-y-6 relative z-10 text-center lg:text-left mt-[-2rem]">
          <div className="max-w-2xl mx-auto lg:mx-0 space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
              Выведите свои квизы на новый уровень
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Новый стандарт для квизов. Гости сканируют QR-код, и их телефоны превращаются в высокоточные игровые пульты. Максимальная вовлеченность, мгновенная реакция и никаких проводов на столах!
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-lg h-14 px-8 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-shadow">
                Организовать игру
              </Button>
            </Link>
          </div>
          
          <div className="pt-8 flex flex-col sm:flex-row gap-6 justify-center lg:justify-start items-center lg:items-start text-sm text-slate-600 font-medium">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">✓</div>
              <span>Мгновенная реакция</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">✓</div>
              <span>Без скачиваний</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">✓</div>
              <span>Авто-победитель</span>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Mockup */}
        <div className="relative flex justify-center lg:justify-center lg:-mr-12 items-center h-full max-h-full">
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
          <div className="relative w-[280px] sm:w-[320px] h-[580px] sm:h-[640px] bg-slate-900 rounded-[3rem] shadow-[2px_2px_0_#334155,4px_4px_0_#334155,6px_6px_0_#1e293b,8px_8px_0_#1e293b,10px_10px_0_#0f172a,12px_12px_0_#0f172a,14px_14px_0_#0f172a,-20px_40px_60px_rgba(0,0,0,0.4)] border-[6px] border-slate-800 p-2 z-10 animate-float-angled transform-gpu mb-10">
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
                    <span className="text-white font-black tracking-widest text-3xl relative z-20 drop-shadow-md">ЖМИ</span>
                    
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
    </div>
  );
}
