import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ActiveSession } from '../services/api';
import { socket } from '../realtime/socket';
import { emitRoomCreateWhenConnected } from '../realtime/roomCreate';
import { useSocketAuthRecovery } from '../realtime/authRecovery';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DashboardLayout } from '../components/DashboardLayout';
import { Volume2, Image as ImageIcon, Crown, ExternalLink, Loader2, Check, AlertTriangle, Upload, MonitorSmartphone, LogOut, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { resolveAssetUrl } from '../lib/assets';

const sessionDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatSessionDate(value: string | null) {
  return value ? sessionDateFormatter.format(new Date(value)) : null;
}

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
  const [isCreating, setIsCreating] = useState(false);

  useSocketAuthRecovery(
    () => { toast.error('Сессия ведущего недействительна. Войдите снова.'); navigate('/login', { replace: true }); },
    () => { toast.error('Не удалось восстановить подключение. Войдите снова.'); navigate('/login', { replace: true }); },
  );

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
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [isLogoutAllDialogOpen, setIsLogoutAllDialogOpen] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
      setCustomLogoUrl(res.customLogoUrl);
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
      setCustomBgUrl(res.customBgUrl);
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
  }, [soundEnabled, soundTheme, bgTheme, isLoaded]);

  const loadSessions = async () => {
    try {
      setSessionsLoading(true);
      setSessionsError('');
      setSessions(await api.getSessions());
    } catch (error) {
      setSessionsError(errorMessage(error, 'Не удалось загрузить активные сессии'));
    } finally {
      setSessionsLoading(false);
    }
  };

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
      await loadSessions();
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

  const handleLogoDelete = async () => {
    try {
      setIsUploadingLogo(true);
      await api.deleteLogo();
      setCustomLogoUrl('');
      toast.success('Логотип удалён');
    } catch (err: any) {
      toast.error('Ошибка удаления', { description: err.message });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleBgDelete = async (theme = 'light') => {
    try {
      setIsUploadingBg(true);
      await api.deleteBg();
      setCustomBgUrl('');
      setBgTheme(theme);
      toast.success('Фоновое изображение удалено');
    } catch (err: any) {
      toast.error('Ошибка удаления', { description: err.message });
    } finally {
      setIsUploadingBg(false);
    }
  };

  const handleBgThemeChange = (theme: string) => {
    if (customBgUrl) {
      void handleBgDelete(theme);
      return;
    }
    setBgTheme(theme);
  };

  const handleCreateRoom = () => {
    if (isCreating) return;
    setIsCreating(true);
    emitRoomCreateWhenConnected((res) => {
      setIsCreating(false);
      if (res.success && res.room) {
        navigate(`/host/room/${res.room.roomId}`, { state: { room: res.room } });
      } else {
        toast.error('Не удалось создать игру', {
          description: !res.success ? res.error : 'Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.'
        });
      }
    }, () => { setIsCreating(false); toast.error('Не удалось подключиться к серверу.'); });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      socket.disconnect();
      navigate('/', { replace: true });
    } catch (error) {
      setSessionsError(errorMessage(error, 'Не удалось выйти'));
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setPendingSessionId(sessionId);
      setSessionsError('');
      await api.revokeSession(sessionId);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      toast.success('Сессия завершена');
    } catch (error) {
      setSessionsError(errorMessage(error, 'Не удалось завершить сессию'));
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleLogoutAll = async () => {
    try {
      setIsLoggingOutAll(true);
      setLogoutAllError('');
      await api.logoutAll();
      socket.disconnect();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutAllError(errorMessage(error, 'Не удалось выйти на всех устройствах'));
    } finally {
      setIsLoggingOutAll(false);
    }
  };

  const resetDeleteDialog = () => {
    setDeletePassword('');
    setDeletePhrase('');
    setDeleteConfirmed(false);
    setDeleteError('');
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword || deletePhrase !== 'УДАЛИТЬ АККАУНТ' || !deleteConfirmed) return;
    try {
      setIsDeletingAccount(true);
      setDeleteError('');
      await api.deleteAccount({
        currentPassword: deletePassword,
        confirmationPhrase: deletePhrase,
        irreversibleConfirmed: deleteConfirmed,
      });
      resetDeleteDialog();
      setIsDeleteDialogOpen(false);
      socket.disconnect();
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(errorMessage(error, 'Не удалось удалить аккаунт'));
    } finally {
      setIsDeletingAccount(false);
    }
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
      onActivated={loadData}
      onProfileUpdated={(newName, newEmail, newAvatarUrl) => {
        if (newName !== undefined) setName(newName);
        if (newEmail !== undefined) setEmail(newEmail);
        if (newAvatarUrl !== undefined) setAvatarUrl(newAvatarUrl ?? undefined);
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
                  <button 
                    type="button"
                    onClick={() => {
                      setSoundTheme('classic');
                      if (soundEnabled) playPreview('classic');
                    }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${soundTheme === 'classic' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                    aria-pressed={soundTheme === 'classic'}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-slate-900">Классическая</div>
                      {soundEnabled && <Volume2 size={16} className="text-slate-500" />}
                    </div>
                    <div className="text-xs text-slate-600">Стандартные пики и гонги</div>
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setSoundTheme('tv');
                      if (soundEnabled) playPreview('tv');
                    }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${soundTheme === 'tv' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                    aria-pressed={soundTheme === 'tv'}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-slate-900">ТВ-шоу</div>
                      {soundEnabled && <Volume2 size={16} className="text-slate-500" />}
                    </div>
                    <div className="text-xs text-slate-600">Эффекты как в известных телеиграх</div>
                  </button>
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
                <Label>Логотип компании</Label>
                <div className="flex gap-3">
                  <input 
                    type="file" 
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden" 
                    ref={logoInputRef}
                    onChange={handleLogoUpload}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="flex items-center gap-2"
                  >
                    {isUploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Загрузить
                  </Button>
                </div>
                <p className="text-xs text-slate-500 leading-normal">
                  Максимальный размер: <strong>5 МБ</strong>. Поддерживаемые форматы: <strong>PNG, JPG, WEBP</strong>.<br />
                  Рекомендуется изображение с прозрачным фоном, пропорции 1:1 или горизонтальные.
                </p>
              </div>
              
              {customLogoUrl && (
                <div className="mt-4 p-4 border rounded-lg bg-slate-50 flex items-center justify-center relative">
                  <img 
                    src={resolveAssetUrl(customLogoUrl) ?? undefined}
                    alt="Предпросмотр логотипа" 
                    className="max-h-16 object-contain"
                  />
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleLogoDelete}
                    className="absolute top-2 right-2 h-7 px-2"
                  >
                    Удалить
                  </Button>
                </div>
              )}

              {/* Задний фон (Стиль игры) */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-1">
                  <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" id="bg-theme-label">Задний фон (Стиль игры)</div>
                  <CardDescription>Выберите готовую тему или загрузите своё фоновое изображение для игровых экранов</CardDescription>
                </div>
                
                {/* Theme Preset Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-labelledby="bg-theme-label">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleBgThemeChange('light')}
                    className={`h-auto min-h-12 whitespace-normal py-2 font-medium transition-all flex items-center justify-center gap-1.5 ${
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
                    onClick={() => handleBgThemeChange('dark')}
                    className={`h-auto min-h-12 whitespace-normal py-2 font-medium bg-slate-900 text-white hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center gap-1.5 ${
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
                    onClick={() => handleBgThemeChange('violet-fuchsia')}
                    className={`h-auto min-h-12 whitespace-normal py-2 font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:text-white transition-all flex items-center justify-center gap-1.5 ${
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
                  <Label>Собственное фоновое изображение</Label>
                  <div className="flex gap-3">
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden" 
                      ref={bgInputRef}
                      onChange={handleBgUpload}
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => bgInputRef.current?.click()}
                      disabled={isUploadingBg}
                      className="flex items-center gap-2"
                    >
                      {isUploadingBg ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Загрузить
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Максимальный размер: <strong>5 МБ</strong>. Поддерживаемые форматы: <strong>PNG, JPG, WEBP</strong>.<br />
                    Рекомендуется использовать контрастные или приглушенные изображения.
                  </p>
                </div>

                {customBgUrl && (
                  <div className="mt-4 p-4 border rounded-lg bg-slate-50 flex flex-col items-center gap-2 relative">
                    <span className="text-xs font-semibold text-slate-500 self-start">Предпросмотр фона:</span>
                    <div 
                      className="w-full h-32 rounded-md bg-cover bg-center border shadow-sm relative overflow-hidden"
                      style={{ backgroundImage: `url(${resolveAssetUrl(customBgUrl)})` }}
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
                      onClick={() => handleBgDelete()}
                      className="absolute top-2 right-2 h-7 px-2"
                    >
                      Удалить
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card id="account-sessions" aria-labelledby="active-sessions-heading" className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MonitorSmartphone className="text-slate-500" size={20} />
                <h2 id="active-sessions-heading">Активные сессии</h2>
              </CardTitle>
              <CardDescription>Устройства, на которых выполнен вход в ваш аккаунт</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {sessionsLoading && <p role="status" className="text-sm text-slate-600">Загрузка сессий...</p>}

              {!sessionsLoading && sessionsError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-3">
                  <p>{sessionsError}</p>
                  <Button type="button" variant="outline" onClick={loadSessions} className="min-h-11 bg-white">
                    Повторить загрузку сессий
                  </Button>
                </div>
              )}

              {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                <p className="text-sm text-slate-600">Активные сессии не найдены.</p>
              )}

              {!sessionsLoading && sessions.length > 0 && (
                <ul className="space-y-3">
                  {sessions.map((session) => (
                    <li key={session.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 break-words">{session.device} · {session.browser}</p>
                          {session.isCurrent && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Текущая сессия</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{session.ipAddress ? `IP: ${session.ipAddress}` : 'IP неизвестен'}</p>
                        <p className="text-sm text-slate-600">
                          Вход: <time dateTime={session.createdAt}>{formatSessionDate(session.createdAt)}</time>
                        </p>
                        <p className="text-sm text-slate-600">
                          {session.lastSeenAt ? (
                            <>Последняя активность: <time dateTime={session.lastSeenAt}>{formatSessionDate(session.lastSeenAt)}</time></>
                          ) : 'Последняя активность неизвестна'}
                        </p>
                      </div>

                      {session.isCurrent ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLogout}
                          aria-label="Выйти из текущей сессии"
                          className="min-h-11 w-full shrink-0 sm:w-auto"
                        >
                          <LogOut size={16} />
                          Выйти
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={pendingSessionId === session.id}
                          aria-label={`Завершить сессию ${session.device}, ${session.browser}`}
                          className="min-h-11 w-full shrink-0 sm:w-auto"
                        >
                          {pendingSessionId === session.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Завершить
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLogoutAllDialogOpen(true)}
                  disabled={sessionsLoading}
                  className="min-h-11 w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 sm:w-auto"
                >
                  <LogOut size={16} />
                  Выйти на всех устройствах
                </Button>
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
            <CardContent className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">Сброс статистики</div>
                  <p className="text-sm text-slate-600">Удаляет всю историю проведенных игр и очищает статистику главной страницы.</p>
                </div>
                
                <Button 
                  variant="destructive" 
                  onClick={() => setIsResetDialogOpen(true)}
                  className="min-h-11 w-full shrink-0 sm:w-auto"
                >
                  Сбросить статистику
                </Button>
              </div>

              <div className="flex flex-col gap-4 border-t border-red-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900">Удаление аккаунта</div>
                  <p className="text-sm text-slate-600">Навсегда удаляет аккаунт, игровые данные и активные сессии. Восстановление невозможно.</p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="min-h-11 w-full shrink-0 sm:w-auto"
                >
                  <Trash2 size={16} />
                  Удалить аккаунт
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

      <Dialog
        open={isLogoutAllDialogOpen}
        onOpenChange={(open) => {
          setIsLogoutAllDialogOpen(open);
          if (!open) setLogoutAllError('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Выйти на всех устройствах?</DialogTitle>
            <DialogDescription>
              Все активные сессии будут завершены, а открытые вами игровые комнаты — закрыты.
            </DialogDescription>
          </DialogHeader>
          {logoutAllError && <p role="alert" className="text-sm text-red-700">{logoutAllError}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsLogoutAllDialogOpen(false)} className="min-h-11 w-full sm:w-auto">
              Отмена
            </Button>
            <Button type="button" variant="destructive" onClick={handleLogoutAll} disabled={isLoggingOutAll} className="min-h-11 w-full sm:w-auto">
              {isLoggingOutAll && <Loader2 className="h-4 w-4 animate-spin" />}
              Подтвердить выход
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) resetDeleteDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Удалить аккаунт навсегда?</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Аккаунт, настройки, история игр и активные сессии будут удалены.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="delete-current-password">Текущий пароль</Label>
              <Input
                id="delete-current-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation-phrase">Фраза подтверждения</Label>
              <Input
                id="delete-confirmation-phrase"
                autoComplete="off"
                value={deletePhrase}
                onChange={(event) => setDeletePhrase(event.target.value)}
                placeholder="УДАЛИТЬ АККАУНТ"
              />
              <p className="text-xs text-slate-600">Введите точно: <strong>УДАЛИТЬ АККАУНТ</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <input
                id="delete-irreversible"
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-red-600"
              />
              <Label htmlFor="delete-irreversible" className="font-normal leading-5">
                Я понимаю, что аккаунт и данные нельзя восстановить
              </Label>
            </div>
            {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="min-h-11 w-full sm:w-auto">
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!deletePassword || deletePhrase !== 'УДАЛИТЬ АККАУНТ' || !deleteConfirmed || isDeletingAccount}
              className="min-h-11 w-full sm:w-auto"
            >
              {isDeletingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              Удалить аккаунт навсегда
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
