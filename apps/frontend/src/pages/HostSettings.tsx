import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, BASE_URL } from '../services/api';
import { socket } from '../realtime/socket';
import type { RoomData } from 'shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DashboardLayout } from '../components/DashboardLayout';
import { Volume2, Image as ImageIcon, Crown, ExternalLink, Loader2, Check, AlertTriangle, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function HostSettings() {
  const navigate = useNavigate();
  const [hasSubscription, setHasSubscription] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState<string | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Settings state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundTheme, setSoundTheme] = useState('classic');
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [customBgUrl, setCustomBgUrl] = useState('');
  const [bgTheme, setBgTheme] = useState('light');

  // Danger Zone
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // File Upload
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой', { description: 'Максимальный размер 5 МБ' });
      return;
    }

    try {
      setIsUploadingLogo(true);
      const res = await api.uploadLogo(file);
      
      const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
      const fullUrl = `${cleanBaseUrl}${res.url}`;
      
      setCustomLogoUrl(fullUrl);
      toast.success('Логотип загружен');
    } catch (err: any) {
      toast.error('Ошибка загрузки', { description: err.message });
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой', { description: 'Максимальный размер 5 МБ' });
      return;
    }

    try {
      setIsUploadingBg(true);
      const res = await api.uploadBg(file);
      
      const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
      const fullUrl = `${cleanBaseUrl}${res.url}`;
      
      setCustomBgUrl(fullUrl);
      setBgTheme('custom');
      toast.success('Фоновое изображение загружено');
    } catch (err: any) {
      toast.error('Ошибка загрузки', { description: err.message });
    } finally {
      setIsUploadingBg(false);
      if (bgInputRef.current) bgInputRef.current.value = '';
    }
  };

  const playPreview = (theme: string) => {
    import('../lib/sounds').then(({ playSound }) => {
      playSound('preview', theme, soundEnabled);
    });
  };

  useEffect(() => {
    loadData().then(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      handleSaveSettings(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [soundEnabled, soundTheme, customLogoUrl, customBgUrl, bgTheme, isLoaded]);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await api.getMe();
      setHasSubscription(user.hasActiveSubscription);
      setEmail(user.email || 'host@example.com');
      setName(user.name);
      setAvatarUrl(user.avatarUrl);
      if (user.subscription) {
        setSubscriptionEndDate(user.subscription.currentPeriodEnd);
      }

      const settings = await api.getSettings();
      if (settings) {
        setSoundEnabled(settings.soundEnabled);
        setSoundTheme(settings.soundTheme || 'classic');
        setCustomLogoUrl(settings.customLogoUrl || '');
        setCustomBgUrl(settings.customBgUrl || '');
        setBgTheme(settings.bgTheme || 'light');
      }
    } catch (err) {
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (silent = false) => {
    try {
      setSaving(true);
      await api.updateSettings({
        soundEnabled,
        soundTheme,
        customLogoUrl: customLogoUrl.trim() === '' ? null : customLogoUrl.trim(),
        customBgUrl: customBgUrl.trim() === '' ? null : customBgUrl.trim(),
        bgTheme,
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
    socket.emit('ROOM_CREATE', '', (res: { success: boolean, room?: RoomData, error?: string }) => {
      if (res.success && res.room) {
        navigate(`/host/room/${res.room.roomId}`, { state: { room: res.room } });
      } else {
        toast.error('Не удалось создать игру', {
          description: res.error || 'Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.'
        });
      }
    });
  };

  const handleLogout = async () => {
    socket.disconnect();
    await api.logout();
    navigate('/', { replace: true });
  };

  const handleResetStatistics = async () => {
    if (resetConfirmationText !== 'ОЧИСТИТЬ') return;
    
    try {
      setIsResetting(true);
      await api.clearHistory();
      toast.success('Статистика успешно сброшена');
      setIsResetDialogOpen(false);
      setResetConfirmationText('');
    } catch (err) {
      toast.error('Ошибка', {
        description: 'Не удалось сбросить статистику. Пожалуйста, попробуйте позже.'
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">Загрузка...</div>;
  }

  return (
    <DashboardLayout
      email={email}
      name={name}
      avatarUrl={avatarUrl}
      customLogoUrl={customLogoUrl}
      hasSubscription={hasSubscription}
      subscriptionEndDate={subscriptionEndDate}
      onLogout={handleLogout}
      onCreateRoom={handleCreateRoom}
      onActivated={() => loadData()}
      onProfileUpdated={(newName, newEmail, newAvatarUrl) => {
        if (newName !== undefined) setName(newName);
        if (newEmail !== undefined) setEmail(newEmail);
        if (newAvatarUrl !== undefined) setAvatarUrl(newAvatarUrl);
      }}
    >
      <div className="p-4 sm:p-6 md:p-10 max-w-4xl mx-auto w-full space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Настройки</h1>
            <p className="text-sm sm:text-base text-slate-600">Управление параметрами игр и подпиской</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Game Settings */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Volume2 className="text-slate-500" size={20} />
                Звуки и эффекты
              </CardTitle>
              <CardDescription>Настройки, которые будут применяться ко всем новым играм</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Звуковые эффекты</Label>
                  <p className="text-sm text-slate-600">Включать звуки правильных/неправильных ответов по умолчанию</p>
                </div>
                <Switch 
                  checked={soundEnabled} 
                  onCheckedChange={setSoundEnabled} 
                />
              </div>

              <div className={`space-y-3 pt-2 transition-all duration-300 ${!soundEnabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <Label className="text-base">Библиотека звуков</Label>
                <p className="text-sm text-slate-600 mb-2">Выберите звуковую тему для ваших мероприятий</p>
                
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
                      {soundEnabled && <Volume2 size={16} className="text-slate-500" />}
                    </div>
                    <div className="text-xs text-slate-600">Стандартные пики и гонги</div>
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
                      {soundEnabled && <Volume2 size={16} className="text-slate-500" />}
                    </div>
                    <div className="text-xs text-slate-600">Эффекты как в известных телеиграх</div>
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
                <Label htmlFor="logoUrl">Ссылка на логотип (URL) или загрузка с компьютера</Label>
                <div className="flex gap-3">
                  <Input 
                    id="logoUrl" 
                    placeholder="https://example.com/my-logo.png" 
                    value={customLogoUrl}
                    onChange={(e) => setCustomLogoUrl(e.target.value)}
                    className="flex-1"
                  />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="shrink-0 flex items-center gap-2"
                  >
                    {isUploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Загрузить
                  </Button>
                </div>
                <p className="text-xs text-slate-500 leading-normal">
                  Максимальный размер: <strong>5 МБ</strong>. Поддерживаемые форматы: <strong>PNG, JPG, WEBP, GIF</strong>.<br />
                  Рекомендуется изображение с прозрачным фоном, пропорции 1:1 или горизонтальные.
                </p>
              </div>
              
              {customLogoUrl && (
                <div className="mt-4 p-4 border rounded-lg bg-slate-50 flex items-center justify-center relative">
                  <img 
                    src={customLogoUrl} 
                    alt="Предпросмотр логотипа" 
                    className="max-h-16 object-contain"
                  />
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => setCustomLogoUrl('')}
                    className="absolute top-2 right-2 h-7 px-2"
                  >
                    Удалить
                  </Button>
                </div>
              )}

              {/* Задний фон (Стиль игры) */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-1">
                  <Label>Задний фон (Стиль игры)</Label>
                  <CardDescription>Выберите готовую тему или загрузите своё фоновое изображение для игровых экранов</CardDescription>
                </div>
                
                {/* Theme Preset Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBgTheme('light');
                      setCustomBgUrl('');
                    }}
                    className={`h-12 font-medium transition-all flex items-center justify-center gap-1.5 ${
                      bgTheme === 'light' && !customBgUrl
                        ? "ring-2 ring-primary ring-offset-2 opacity-100 font-bold border-primary"
                        : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    {bgTheme === 'light' && !customBgUrl && <Check size={16} className="shrink-0" />}
                    Светлая (по умолчанию)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBgTheme('dark');
                      setCustomBgUrl('');
                    }}
                    className={`h-12 font-medium bg-slate-900 text-white hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-1.5 ${
                      bgTheme === 'dark' && !customBgUrl
                        ? "ring-2 ring-slate-900 ring-offset-2 opacity-100 font-bold"
                        : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    {bgTheme === 'dark' && !customBgUrl && <Check size={16} className="shrink-0" />}
                    Темная
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBgTheme('violet-fuchsia');
                      setCustomBgUrl('');
                    }}
                    className={`h-12 font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:text-white transition-all flex items-center justify-center gap-1.5 ${
                      bgTheme === 'violet-fuchsia' && !customBgUrl
                        ? "ring-2 ring-violet-600 ring-offset-2 opacity-100 font-bold"
                        : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    {bgTheme === 'violet-fuchsia' && !customBgUrl && <Check size={16} className="shrink-0" />}
                    Фиолетовый градиент
                  </Button>
                </div>

                {/* Custom Background Upload */}
                <div className="space-y-2 pt-2">
                  <Label htmlFor="bgUrl">Собственное фоновое изображение (URL или загрузка)</Label>
                  <div className="flex gap-3">
                    <Input 
                      id="bgUrl" 
                      placeholder="https://example.com/my-bg.jpg" 
                      value={customBgUrl}
                      onChange={(e) => {
                        setCustomBgUrl(e.target.value);
                        setBgTheme('custom');
                      }}
                      className="flex-1"
                    />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={bgInputRef}
                      onChange={handleBgUpload}
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => bgInputRef.current?.click()}
                      disabled={isUploadingBg}
                      className="shrink-0 flex items-center gap-2"
                    >
                      {isUploadingBg ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Загрузить
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Максимальный размер: <strong>5 МБ</strong>. Поддерживаемые форматы: <strong>PNG, JPG, WEBP, GIF</strong>.<br />
                    Рекомендуется использовать контрастные или приглушенные изображения.
                  </p>
                </div>

                {customBgUrl && (
                  <div className="mt-4 p-4 border rounded-lg bg-slate-50 flex flex-col items-center gap-2 relative">
                    <span className="text-xs font-semibold text-slate-500 self-start">Предпросмотр фона:</span>
                    <div 
                      className="w-full h-32 rounded-md bg-cover bg-center border shadow-sm relative overflow-hidden"
                      style={{ backgroundImage: `url(${customBgUrl})` }}
                    >
                      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
                        <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/40 rounded-full">
                          Текст квиза будет читаемым
                        </span>
                      </div>
                    </div>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => {
                        setCustomBgUrl('');
                        setBgTheme('light');
                      }}
                      className="absolute top-2 right-2 h-7 px-2"
                    >
                      Удалить
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Billing Settings */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="text-slate-500" size={20} />
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
                  <p className="text-sm text-slate-600">Доступны все функции для ведущих</p>
                </div>
                <Button variant="outline" className="gap-2 shrink-0 bg-white" onClick={() => window.open('mailto:support@quizpult.ru')}>
                  Управление тарифом
                  <ExternalLink size={16} className="text-slate-500" />
                </Button>
              </div>
              <p className="text-xs text-center text-slate-500 mt-4">
                Для отмены или изменения подписки, пожалуйста, свяжитесь со службой поддержки.
              </p>
            </CardContent>
          </Card>
          {/* Danger Zone */}
          <Card className="border-red-200 shadow-sm overflow-hidden relative">
            <CardHeader className="bg-red-50/50 border-b border-red-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                <AlertTriangle size={20} />
                Опасная зона
              </CardTitle>
              <CardDescription className="text-red-600/80">
                Необратимые действия с вашим аккаунтом и данными
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">Сброс статистики</div>
                  <p className="text-sm text-slate-600">Удаляет всю историю проведенных игр и очищает статистику главной страницы.</p>
                </div>
                
                <Button 
                  variant="destructive" 
                  onClick={() => setIsResetDialogOpen(true)}
                  className="shrink-0"
                >
                  Сбросить статистику
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle size={20} />
              Вы уверены?
            </DialogTitle>
            <DialogDescription>
              Это действие <strong>необратимо</strong>. Вся история ваших проведенных игр, включая участников и баллы, будет навсегда удалена из базы данных.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirmationText" className="text-slate-700">
                Для подтверждения введите слово <strong>ОЧИСТИТЬ</strong>
              </Label>
              <Input
                id="confirmationText"
                placeholder="ОЧИСТИТЬ"
                value={resetConfirmationText}
                onChange={(e) => setResetConfirmationText(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsResetDialogOpen(false);
                setResetConfirmationText('');
              }}
              className="w-full sm:w-auto"
            >
              Отмена
            </Button>
            <Button 
              type="button" 
              variant="destructive"
              onClick={handleResetStatistics}
              disabled={resetConfirmationText !== 'ОЧИСТИТЬ' || isResetting}
              className="w-full sm:w-auto"
            >
              {isResetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                'Я понимаю, удалить данные'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
