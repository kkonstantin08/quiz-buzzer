import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../realtime/socket';
import type { RoomData } from 'shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DashboardLayout } from '../components/DashboardLayout';
import { Volume2, Image as ImageIcon, Crown, ExternalLink, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

export function HostSettings() {
  const navigate = useNavigate();
  const [token] = useState(localStorage.getItem('hostToken') || '');
  const [hasSubscription, setHasSubscription] = useState(true);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Settings state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundTheme, setSoundTheme] = useState('classic');
  const [customLogoUrl, setCustomLogoUrl] = useState('');

  const playPreview = (theme: string) => {
    import('../lib/sounds').then(({ playSound }) => {
      playSound('preview', theme, soundEnabled);
    });
  };

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    loadData(token).then(() => setIsLoaded(true));
  }, [token, navigate]);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      handleSaveSettings(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [soundEnabled, soundTheme, customLogoUrl, isLoaded]);

  const loadData = async (t: string) => {
    try {
      setLoading(true);
      const user = await api.getMe(t);
      setHasSubscription(user.hasActiveSubscription);
      setEmail(user.email || 'host@example.com');

      const settings = await api.getSettings(t);
      if (settings) {
        setSoundEnabled(settings.soundEnabled);
        setSoundTheme(settings.soundTheme || 'classic');
        setCustomLogoUrl(settings.customLogoUrl || '');
      }
    } catch (err) {
      localStorage.removeItem('hostToken');
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (silent = false) => {
    try {
      setSaving(true);
      await api.updateSettings(token, {
        soundEnabled,
        soundTheme,
        customLogoUrl: customLogoUrl.trim() === '' ? null : customLogoUrl.trim(),
      });
      if (!silent) toast.success('Настройки успешно сохранены!');
    } catch (error) {
      if (!silent) {
        toast.error('Ошибка', {
          description: 'Не удалось сохранить настройки. Пожалуйста, попробуйте позже.'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = () => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('ROOM_CREATE', token, (res: { success: boolean, room?: RoomData, error?: string }) => {
      if (res.success && res.room) {
        navigate(`/host/room/${res.room.roomId}`, { state: { room: res.room } });
      } else {
        toast.error('Не удалось создать комнату', {
          description: res.error || 'Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.'
        });
      }
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('hostToken');
    navigate('/', { replace: true });
  };

  if (loading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">Загрузка...</div>;
  }

  return (
    <DashboardLayout
      email={email}
      hasSubscription={hasSubscription}
      onLogout={handleLogout}
      onCreateRoom={handleCreateRoom}
      onActivated={() => loadData(token)}
    >
      <div className="p-4 sm:p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Настройки</h1>
            <p className="text-sm sm:text-base text-slate-500">Управление параметрами игр и подпиской</p>
          </div>
          <div className="text-sm font-medium text-slate-400 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin text-slate-400" />
                Сохранение...
              </>
            ) : (
              <>
                <Check size={14} className="text-green-500" />
                Сохранено
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Game Settings */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Volume2 className="text-slate-400" size={20} />
                Звуки и эффекты
              </CardTitle>
              <CardDescription>Настройки, которые будут применяться ко всем новым комнатам</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Звуковые эффекты</Label>
                  <p className="text-sm text-slate-500">Включать звуки правильных/неправильных ответов по умолчанию</p>
                </div>
                <Switch 
                  checked={soundEnabled} 
                  onCheckedChange={setSoundEnabled} 
                />
              </div>

              <div className={`space-y-3 pt-2 transition-all duration-300 ${!soundEnabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <Label className="text-base">Библиотека звуков</Label>
                <p className="text-sm text-slate-500 mb-2">Выберите звуковую тему для ваших мероприятий</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div 
                    onClick={() => {
                      setSoundTheme('classic');
                      if (soundEnabled) playPreview('classic');
                    }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${soundTheme === 'classic' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-slate-900">Классическая</div>
                      {soundEnabled && <Volume2 size={16} className="text-slate-400" />}
                    </div>
                    <div className="text-xs text-slate-500">Стандартные пики и гонги</div>
                  </div>
                  <div 
                    onClick={() => {
                      setSoundTheme('tv');
                      if (soundEnabled) playPreview('tv');
                    }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${soundTheme === 'tv' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-slate-900">ТВ-шоу</div>
                      {soundEnabled && <Volume2 size={16} className="text-slate-400" />}
                    </div>
                    <div className="text-xs text-slate-500">Эффекты как в известных телеиграх</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customization (PRO) */}
          <Card className="border-amber-200 shadow-sm overflow-hidden relative">
            <CardHeader className="bg-amber-50/50 border-b border-amber-100 pb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="text-amber-500" size={20} />
                <CardTitle className="text-lg text-slate-900">Брендирование</CardTitle>
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-sm">PRO</span>
              </div>
              <CardDescription>Замените стандартный логотип КвизПульт на логотип вашей компании</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Ссылка на логотип (URL)</Label>
                <div className="flex gap-3">
                  <Input 
                    id="logoUrl" 
                    placeholder="https://example.com/my-logo.png" 
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-slate-500">Рекомендуемый формат: PNG с прозрачным фоном, пропорции 1:1 или горизонтальные.</p>
              </div>
              
              {customLogoUrl && (
                <div className="mt-4 p-4 border rounded-lg bg-slate-50 flex items-center justify-center">
                  <img 
                    src={customLogoUrl} 
                    alt="Предпросмотр логотипа" 
                    className="max-h-16 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NDBhMWUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjxsaW5lIHgxPSIxMiIgeTE9IjgiIHgyPSIxMiIgeTI9IjEyIi8+PGxpbmUgeDE9IjEyIiB5MT0iMTYiIHgyPSIxMi4wMSIgeTI9IjE2Ii8+PC9zdmc+';
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Billing Settings */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="text-slate-400" size={20} />
                Подписка
              </CardTitle>
              <CardDescription>Управление вашим тарифным планом</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-xl bg-slate-50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">Ваш тариф:</span>
                    <span className="inline-flex items-center gap-1 font-black text-amber-600">
                      <Crown size={14} />
                      PRO
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">Доступны все функции для ведущих</p>
                </div>
                <Button variant="outline" className="gap-2 shrink-0 bg-white" onClick={() => window.open('mailto:support@quizpult.ru')}>
                  Управление тарифом
                  <ExternalLink size={16} className="text-slate-400" />
                </Button>
              </div>
              <p className="text-xs text-center text-slate-400 mt-4">
                Для отмены или изменения подписки, пожалуйста, свяжитесь со службой поддержки.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
