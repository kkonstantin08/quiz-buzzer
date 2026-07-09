import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Rocket, Zap, Users, Crown, Sparkles, Loader2 } from 'lucide-react';

export function BillingModal({ onActivated }: { onActivated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFreeActivation = async () => {
    setLoading(true);
    setError('');
    try {
      const apiBase = import.meta.env.DEV
        ? `http://${window.location.hostname}:3001/api`
        : `${import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL}/api`;

      const res = await fetch(`${apiBase}/billing/activate-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // httpOnly cookie sent automatically
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to activate');
      
      onActivated();
    } catch (err: any) {
      setError(err.message || 'Ошибка активации');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = () => {
    toast.info('В разработке', {
      description: <span className="text-slate-600">Интеграция с ЮKassa находится в разработке. Пожалуйста, воспользуйтесь бесплатной активацией.</span>
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <Card className="w-full max-w-4xl shadow-2xl border-0 overflow-hidden relative bg-white ring-1 ring-white/20 flex flex-col max-h-[95vh] animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
        
        {/* Header Section */}
        <div className="relative py-5 px-6 text-center bg-gradient-to-b from-violet-50 to-white overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-500"></div>
          
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white mb-2 shadow-lg shadow-violet-500/30 animate-float hover:scale-110 transition-transform">
            <Crown size={24} strokeWidth={2.5} />
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              Платформа для
            </span>
            {' '}незабываемых игр
          </h2>
          <p className="text-slate-600 text-sm max-w-lg mx-auto">
            Больше возможностей для вашего интерактива. Создавайте ивенты, которые запомнятся.
          </p>
        </div>
        
        <div className="overflow-y-auto sm:overflow-visible flex-1 custom-scrollbar">
          <CardContent className="p-6 pt-0">
            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg font-medium border border-red-100 animate-in slide-in-from-top-2 mb-4">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Left Column: Features Grid */}
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-violet-50/80 transition-colors duration-300 group cursor-default animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both" style={{ animationDelay: '200ms' }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Rocket size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base mb-0.5">Безлимитные игры</h4>
                    <p className="text-slate-600 text-sm leading-snug">Создавайте неограниченное количество комнат и раундов для любой аудитории.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-fuchsia-50/80 transition-colors duration-300 group cursor-default animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both" style={{ animationDelay: '350ms' }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base mb-0.5">Моментальный отклик</h4>
                    <p className="text-slate-600 text-sm leading-snug">Идеальная честность игры благодаря риал-тайм архитектуре без задержек.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-orange-50/80 transition-colors duration-300 group cursor-default animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both" style={{ animationDelay: '500ms' }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Users size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-base mb-0.5">Простое подключение</h4>
                    <p className="text-slate-600 text-sm leading-snug">Никаких скачиваний. Участникам нужен только телефон, чтобы сканировать QR-код.</p>
                  </div>
                </div>
              </div>
              
              {/* Right Column: Pricing & Actions */}
              <div className="flex flex-col space-y-4">
                {/* Pricing Card */}
                <div className="relative p-5 rounded-3xl bg-slate-900 text-white overflow-hidden shadow-2xl shadow-slate-900/20 transform transition-transform hover:scale-[1.02] duration-300 animate-in fade-in zoom-in-95 duration-700 fill-mode-both" style={{ animationDelay: '400ms' }}>
                  {/* Background Glow */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 pointer-events-none animate-pulse"></div>
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500 rounded-full blur-3xl opacity-20 -ml-10 -mb-10 pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>
                  
                  <div className="relative z-10 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-violet-200 text-xs font-bold uppercase tracking-widest mb-3">
                      <Sparkles size={14} />
                      Полный доступ
                    </div>
                    <div className="flex items-end justify-center gap-1 mb-1">
                      <span className="text-4xl font-black tracking-tight">990 ₽</span>
                      <span className="text-lg text-slate-500 font-medium mb-1">/ месяц</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Автоматическое продление. Отмена в любой момент.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both" style={{ animationDelay: '600ms' }}>
                  <Button 
                    className="w-full h-14 text-lg font-bold bg-gradient-to-r from-violet-600 hover:from-violet-500 to-fuchsia-600 hover:to-fuchsia-500 text-white shadow-xl shadow-violet-500/30 border-0 transition-all hover:shadow-violet-500/50 hover:-translate-y-0.5" 
                    onClick={handleCheckout}
                  >
                    Оплатить подписку (ЮKassa)
                  </Button>
                  
                  <div className="relative w-full text-center py-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                    <span className="relative bg-white px-4 text-xs text-slate-500 uppercase font-bold tracking-wider">или попробовать</span>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    className="w-full h-12 text-sm font-semibold text-slate-600 border-2 border-slate-200 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all"
                    onClick={handleFreeActivation}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Активация...
                      </>
                    ) : (
                      'Активировать бесплатно на 30 дней'
                    )}
                  </Button>
                </div>
              </div>
            </div>

          </CardContent>
        </div>
      </Card>
    </div>
  );
}
