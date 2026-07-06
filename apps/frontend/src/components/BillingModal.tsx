import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '../services/api';
import { toast } from 'sonner';

export function BillingModal({ onActivated }: { onActivated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFreeActivation = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('hostToken');
      if (!token) throw new Error('No auth token');
      
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/billing/activate-free`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
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
      description: 'Интеграция с ЮKassa находится в разработке. Пожалуйста, воспользуйтесь бесплатной активацией.'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-2xl border-0 overflow-hidden">
        <div className="bg-primary p-6 text-primary-foreground text-center">
          <h2 className="text-2xl font-black uppercase tracking-wider mb-2">Оформите подписку</h2>
          <p className="text-primary-foreground/80">Для создания комнат и проведения викторин необходима активная подписка.</p>
        </div>
        
        <CardContent className="p-8 space-y-6 bg-white">
          {error && <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-md font-medium border border-red-100">{error}</div>}
          
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-slate-800">Что дает подписка:</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">✓</span>
                <span>Создание неограниченного количества игр и комнат</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">✓</span>
                <span>Моментальный отклик без задержек — идеальная честность игры</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-bold">✓</span>
                <span>Легкое подключение участников — нужен только телефон и камера</span>
              </li>
            </ul>
          </div>
          
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
            <div className="text-3xl font-black text-slate-900 mb-1">990 ₽ <span className="text-lg font-normal text-slate-500">/ месяц</span></div>
            <p className="text-sm text-slate-500">Автоматическое продление, отмена в любой момент</p>
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col gap-3 p-8 pt-0 bg-white">
          <Button 
            className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20" 
            onClick={handleCheckout}
          >
            Оплатить подписку (ЮKassa)
          </Button>
          
          <div className="relative w-full text-center py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <span className="relative bg-white px-4 text-xs text-slate-400 uppercase font-semibold tracking-wider">или</span>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full h-12 text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={handleFreeActivation}
            disabled={loading}
          >
            {loading ? 'Активация...' : 'Бесплатно активировать на месяц'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
