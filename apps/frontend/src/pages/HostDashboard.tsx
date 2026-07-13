import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../realtime/socket';
import { emitRoomCreateWhenConnected } from '../realtime/roomCreate';
import { useSocketAuthRecovery } from '../realtime/authRecovery';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Play, History, Plus } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { toast } from 'sonner';

export function HostDashboard() {
  const navigate = useNavigate();
  const [hasSubscription, setHasSubscription] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState<string | undefined>(undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [gamesCount, setGamesCount] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  useSocketAuthRecovery(
    () => { toast.error('Сессия ведущего недействительна. Войдите снова.'); navigate('/login', { replace: true }); },
    () => { toast.error('Не удалось восстановить подключение. Войдите снова.'); navigate('/login', { replace: true }); },
  );

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const data = await api.getMe();
      setHasSubscription(data.hasActiveSubscription);
      setEmail(data.email || 'host@example.com');
      setName(data.name);
      setAvatarUrl(data.avatarUrl);
      setCustomLogoUrl(data.customLogoUrl);
      if (data.subscription) {
        setSubscriptionEndDate(data.subscription.currentPeriodEnd);
      }
      
      try {
        const histData = await api.getHistory();
        setHistory(histData.history || []);
        setGamesCount(histData.count || 0);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    } catch (err) {
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
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
    socket.disconnect();
    await api.logout();
    navigate('/', { replace: true });
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
      onActivated={() => checkAuth()}
      onProfileUpdated={(newName, newEmail, newAvatar) => {
        if (newName !== undefined) setName(newName);
        if (newEmail !== undefined) setEmail(newEmail);
        if (newAvatar !== undefined) setAvatarUrl(newAvatar);
      }}
    >
      <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto w-full space-y-6 md:space-y-8 pb-20">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Добро пожаловать</h1>
          <p className="text-sm sm:text-base text-slate-600">Управляйте вашими играми и запускайте новые квизы</p>
        </div>

        {/* Hero Action Card */}
        <Card className="border-0 shadow-xl shadow-violet-500/20 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute left-0 bottom-0 w-48 h-48 bg-black/10 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>
          
          <CardContent className="p-6 sm:p-8 md:p-12 relative z-10 flex flex-col lg:flex-row items-center gap-6 lg:gap-8 justify-between">
            <div className="space-y-3 text-center lg:text-left">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight drop-shadow-sm">Готовы начать игру?</h2>
              <p className="text-violet-100 max-w-md text-sm sm:text-base md:text-lg">
                Создайте новую игру в один клик. Игроки смогут присоединиться по QR-коду со своих смартфонов.
              </p>
            </div>
            <Button 
              onClick={handleCreateRoom} 
              disabled={isCreating}
              className="h-14 sm:h-16 px-6 sm:px-8 text-base sm:text-lg bg-white text-violet-600 hover:bg-slate-50 hover:text-violet-700 shadow-xl shadow-black/20 shrink-0 w-full lg:w-auto rounded-2xl transition-all hover:scale-105 active:scale-95 font-bold"
            >
              <Play className="mr-2 h-5 w-5 sm:h-6 sm:w-6 fill-current" />
              Создать игру
            </Button>
          </CardContent>
        </Card>


        {/* Stats / Recent placeholder */}
        <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base md:text-lg">Последние игры</CardTitle>
              <CardDescription>История запущенных игр</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 md:py-10 text-slate-500">
                  <History className="w-10 h-10 md:w-12 md:h-12 mb-3 opacity-20" />
                  <p className="text-sm md:text-base">Пока нет завершенных игр</p>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {history.slice(0, 5).map((game: any) => (
                    <div key={game.id} className="flex justify-between items-center pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                      <div>
                        <div className="font-medium text-slate-800">
                          {game.winnerName} <span className="text-amber-500 text-xs">👑 {game.winnerScore}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Игроков: {game.participants} • {new Date(game.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                        {game.roomCode}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base md:text-lg">Статистика</CardTitle>
              <CardDescription>Сводка по всем мероприятиям</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8 md:py-10 text-slate-500">
              <div className="text-3xl md:text-4xl font-black text-slate-800 mb-1">{gamesCount}</div>
              <p className="text-sm md:text-base">Сыграно игр</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
