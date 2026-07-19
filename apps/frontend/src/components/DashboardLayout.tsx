import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BillingModal } from './BillingModal';
import { LayoutDashboard, History, Settings, LogOut, Plus, Crown, Target, User, Save, Calendar, Pencil, Upload, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api } from '../services/api';
import { resolveAssetUrl } from '../lib/assets';

const LogoIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-sm shrink-0">
    <Target className="w-5 h-5 text-white" strokeWidth={2.5} />
  </div>
);

interface DashboardLayoutProps {
  children: React.ReactNode;
  email: string;
  name?: string;
  avatarUrl?: string;
  customLogoUrl?: string | null;
  hasSubscription: boolean;
  subscriptionEndDate?: string;
  onLogout: () => void;
  onCreateRoom: () => void;
  onActivated?: () => void;
  onProfileUpdated?: (newName?: string, newEmail?: string, newAvatar?: string | null) => void;
}

export function DashboardLayout({ 
  children, 
  email, 
  name,
  avatarUrl,
  customLogoUrl,
  hasSubscription, 
  subscriptionEndDate,
  onLogout, 
  onCreateRoom,
  onActivated,
  onProfileUpdated
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboard = location.pathname === '/dashboard';
  const isSettings = location.pathname === '/settings';

  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(name || '');
  const [editEmail, setEditEmail] = React.useState(email || '');
  const [emailCurrentPassword, setEmailCurrentPassword] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync state when props change
  React.useEffect(() => {
    setEditName(name || '');
    setEditEmail(email || '');
  }, [name, email]);

  const emailChanged = editEmail.trim().toLowerCase() !== email.trim().toLowerCase();
  const nameChanged = editName !== (name || '');

  const clearPasswords = () => {
    setEmailCurrentPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSaveProfile = async () => {
    if (!nameChanged && !emailChanged) return;
    if (emailChanged && !emailCurrentPassword) {
      toast.error('Введите текущий пароль для смены email');
      return;
    }

    try {
      setIsSaving(true);
      const res = await api.updateProfile({
        ...(nameChanged ? { name: editName } : {}),
        ...(emailChanged ? { email: editEmail, currentPassword: emailCurrentPassword } : {}),
      });
      
      toast.success('Профиль успешно обновлен!');
      clearPasswords();
      setIsProfileOpen(false);
      if (onProfileUpdated) {
        onProfileUpdated(res.name, res.email);
      }
    } catch (err: any) {
      toast.error('Ошибка сохранения', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Новые пароли не совпадают');
      return;
    }

    try {
      setIsChangingPassword(true);
      await api.changePassword({ currentPassword, newPassword });
      clearPasswords();
      toast.success('Пароль успешно изменен!');
    } catch (err: any) {
      toast.error('Ошибка смены пароля', { description: err.message });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await api.uploadAvatar(file);
      toast.success('Аватарка обновлена!');
      
      if (onProfileUpdated) {
        onProfileUpdated(undefined, undefined, res.avatarUrl);
      }
    } catch (err: any) {
      toast.error('Ошибка загрузки', { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    try {
      setIsUploading(true);
      await api.deleteAvatar();
      onProfileUpdated?.(undefined, undefined, null);
      toast.success('Аватарка удалена!');
    } catch (err: any) {
      toast.error('Ошибка удаления', { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const displayName = name || email;
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';
  const avatarSrc = resolveAssetUrl(avatarUrl);

  return (
    <Dialog open={isProfileOpen} onOpenChange={(open) => { setIsProfileOpen(open); if (!open) clearPasswords(); }}>
      <div className="flex min-h-[100dvh] bg-slate-50">
      {!hasSubscription && <BillingModal onActivated={onActivated || (() => {})} />}

      {/* Sidebar (Desktop) */}
      <aside className="w-64 bg-white border-r border-slate-200 flex-col hidden md:flex shrink-0">
        <Link to="/dashboard" className="h-16 flex items-center px-6 border-b border-slate-100 gap-3 shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
          {customLogoUrl ? (
            <img src={resolveAssetUrl(customLogoUrl) ?? undefined} alt="Logo" className="max-h-8 object-contain" />
          ) : (
            <>
              <LogoIcon />
              <span className="font-black text-xl text-slate-800 tracking-tight">КвизПульт</span>
            </>
          )}
        </Link>
        
        <div className="p-4 shrink-0">
          <Button onClick={onCreateRoom} className="w-full justify-start gap-2 h-11 bg-slate-900 hover:bg-slate-800 text-white shadow-md">
            <Plus size={18} />
            Создать игру
          </Button>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          <Button 
            variant="ghost" 
            className={`w-full justify-start gap-3 font-medium ${isDashboard ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
            onClick={() => navigate('/dashboard')}
          >
            <LayoutDashboard size={18} />
            Главная
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50" disabled>
            <History size={18} />
            История игр
          </Button>
          <Button 
            variant="ghost" 
            className={`w-full justify-start gap-3 font-medium ${isSettings ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
            onClick={() => navigate('/settings')}
          >
            <Settings size={18} />
            Настройки
          </Button>
        </nav>

        <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50/50">
            <DialogTrigger asChild>
              <button type="button" className="flex w-full items-center gap-3 mb-4 px-2 cursor-pointer hover:bg-slate-100 p-2 rounded-lg transition-colors -mx-2 text-left">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 border border-slate-300 overflow-hidden">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-slate-600">{initial}</span>
                  )}
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate" title={displayName}>{displayName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {hasSubscription ? (
                      <>
                        <Crown size={12} className="text-amber-500" />
                        <span className="text-[10px] font-bold tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-sm">
                          PRO Plan
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-bold tracking-wide text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded-sm">
                        Бесплатно
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Профиль</DialogTitle>
                <DialogDescription>
                  Просматривайте статус подписки и редактируйте свои данные.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div 
                      className="relative w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center shrink-0 border border-slate-300 overflow-hidden cursor-pointer group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-bold text-2xl text-slate-600">{initial}</span>
                      )}
                      
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {isUploading ? (
                          <Loader2 size={20} className="text-white animate-spin" />
                        ) : (
                          <Pencil size={20} className="text-white drop-shadow-md" />
                        )}
                      </div>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarUpload}
                    />

                    <div>
                      <p className="font-semibold text-lg text-slate-900">{displayName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {hasSubscription ? (
                          <div className="flex items-center gap-1 text-sm text-amber-600 font-medium bg-amber-100 px-2 py-0.5 rounded-sm">
                            <Crown size={14} /> PRO Подписка
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600 font-medium bg-slate-200 px-2 py-0.5 rounded-sm">
                            Бесплатный план
                          </div>
                        )}
                      </div>
                    </div>
                    {avatarUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleAvatarDelete} disabled={isUploading}>
                        <Trash2 size={14} className="mr-1" /> Удалить
                      </Button>
                    )}
                  </div>
                  
                  {hasSubscription && subscriptionEndDate && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Calendar size={16} />
                      <span>Активна до: <strong>{new Date(subscriptionEndDate).toLocaleDateString()}</strong></span>
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Имя (необязательно)</Label>
                    <Input
                      id="name"
                      placeholder="Ваше имя"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email (Логин)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={editEmail}
                      onChange={(e) => {
                        setEditEmail(e.target.value);
                        if (e.target.value.trim().toLowerCase() === email.trim().toLowerCase()) setEmailCurrentPassword('');
                      }}
                    />
                  </div>
                  {emailChanged && (
                    <div className="grid gap-2">
                      <Label htmlFor="email-current-password">Текущий пароль для смены email</Label>
                      <Input
                        id="email-current-password"
                        type="password"
                        autoComplete="current-password"
                        value={emailCurrentPassword}
                        onChange={(e) => setEmailCurrentPassword(e.target.value)}
                      />
                    </div>
                  )}
                  <Button 
                    className="w-full mt-2" 
                    onClick={handleSaveProfile} 
                    disabled={isSaving || (!nameChanged && !emailChanged)}
                  >
                    {isSaving ? 'Сохранение...' : (
                      <>
                        <Save className="w-4 h-4 mr-2" /> Сохранить изменения
                      </>
                    )}
                  </Button>
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <p className="text-sm font-medium text-slate-900">Смена пароля</p>
                    <div className="grid gap-2">
                      <Label htmlFor="password-current">Текущий пароль</Label>
                      <Input id="password-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password-new">Новый пароль</Label>
                      <Input id="password-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password-confirmation">Повторите новый пароль</Label>
                      <Input id="password-confirmation" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                    <Button className="w-full" onClick={handleChangePassword} disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}>
                      {isChangingPassword ? 'Изменение пароля...' : 'Изменить пароль'}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600 hover:text-red-600 hover:bg-red-50" onClick={() => setShowLogoutDialog(true)}>
            <LogOut size={18} />
            Выйти
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col h-[100dvh] overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-white border-b flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
          <Link to="/dashboard" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {customLogoUrl ? (
            <img src={resolveAssetUrl(customLogoUrl) ?? undefined} alt="Logo" className="max-h-8 object-contain" />
            ) : (
              <>
                <LogoIcon />
                <span className="font-black text-lg text-slate-800">КвизПульт</span>
              </>
            )}
          </Link>
          <div className="flex items-center gap-1">
            {hasSubscription && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                onClick={() => toast.success('Тариф PRO активен', { description: 'Все премиум-функции разблокированы!' })}
              >
                <Crown size={20} />
              </Button>
            )}
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Открыть профиль" className="text-slate-600 hover:bg-slate-100">
                <User size={20} />
              </Button>
            </DialogTrigger>
            <Button variant="ghost" size="icon" onClick={() => navigate(isDashboard ? '/settings' : '/dashboard')} className="text-slate-600 hover:bg-slate-100">
              {isDashboard ? <Settings size={20} /> : <LayoutDashboard size={20} />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowLogoutDialog(true)} className="text-slate-600 hover:text-red-600">
              <LogOut size={20} />
            </Button>
          </div>
        </header>

        {children}

        <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <DialogContent className="w-[95vw] max-w-[425px] p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-bold">Выход из аккаунта</DialogTitle>
              <DialogDescription className="text-sm sm:text-base mt-1.5">
                Вы уверены, что хотите выйти?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
              <Button variant="outline" className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm" onClick={() => setShowLogoutDialog(false)}>
                Отмена
              </Button>
              <Button variant="destructive" className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm" onClick={() => {
                setShowLogoutDialog(false);
                onLogout();
              }}>
                Выйти
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      </div>
    </Dialog>
  );
}
