import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, History, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, type GameHistoryItem } from '../services/api';
import { socket } from '../realtime/socket';
import { emitRoomCreateWhenConnected } from '../realtime/roomCreate';
import { useSocketAuthRecovery } from '../realtime/authRecovery';
import { DashboardLayout } from '../components/DashboardLayout';
import { GameHistoryResult } from '../components/GameHistoryResult';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const historyDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function HostHistory() {
  const navigate = useNavigate();
  const [hasSubscription, setHasSubscription] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string>();
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [clearError, setClearError] = useState('');
  const [clearing, setClearing] = useState(false);

  useSocketAuthRecovery(
    () => { toast.error('Сессия ведущего недействительна. Войдите снова.'); navigate('/login', { replace: true }); },
    () => { toast.error('Не удалось восстановить подключение. Войдите снова.'); navigate('/login', { replace: true }); },
  );

  const loadHistory = async (nextPage: number) => {
    try {
      setHistoryLoading(true);
      setLoadError('');
      const data = await api.getHistory(nextPage, 10);
      setHistory(data.history);
      setCount(data.count);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (error) {
      setLoadError(message(error, 'Не удалось загрузить историю'));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const user = await api.getMe();
        setHasSubscription(user.hasActiveSubscription);
        setEmail(user.email || 'host@example.com');
        setName(user.name);
        setAvatarUrl(user.avatarUrl ?? undefined);
        setCustomLogoUrl(user.customLogoUrl);
        setSubscriptionEndDate(user.subscription?.currentPeriodEnd);
        await loadHistory(1);
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    void initialize();
  }, [navigate]);

  const handleCreateRoom = () => {
    if (isCreating) return;
    setIsCreating(true);
    emitRoomCreateWhenConnected((response) => {
      setIsCreating(false);
      if (response.success && response.room) {
        navigate(`/host/room/${response.room.roomId}`, { state: { room: response.room } });
      } else {
        toast.error('Не удалось создать игру');
      }
    }, () => {
      setIsCreating(false);
      toast.error('Не удалось подключиться к серверу.');
    });
  };

  const handleLogout = async () => {
    await api.logout();
    socket.disconnect();
    navigate('/', { replace: true });
  };

  const handleClear = async () => {
    try {
      setClearing(true);
      setClearError('');
      await api.clearHistory();
      setHistory([]);
      setCount(0);
      setPage(1);
      setTotalPages(0);
      setClearOpen(false);
      setConfirmation('');
      toast.success('История игр очищена');
    } catch (error) {
      setClearError(message(error, 'Не удалось очистить историю'));
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex min-h-[100dvh] items-center justify-center gap-2 bg-slate-50 text-slate-600">
        <Loader2 className="animate-spin" aria-hidden="true" />
        Загрузка истории…
      </div>
    );
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
      onActivated={() => setHasSubscription(true)}
      onProfileUpdated={(nextName, nextEmail, nextAvatar) => {
        if (nextName !== undefined) setName(nextName);
        if (nextEmail !== undefined) setEmail(nextEmail);
        if (nextAvatar !== undefined) setAvatarUrl(nextAvatar ?? undefined);
      }}
    >
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-20 sm:p-6 md:p-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">История игр</h1>
            <p className="text-sm text-slate-600 sm:text-base">Итоги проведённых игр в порядке от новых к старым.</p>
          </div>
          {count > 0 && (
            <Button variant="destructive" className="min-h-11 w-full bg-red-700 hover:bg-red-800 sm:w-auto" onClick={() => setClearOpen(true)}>
              <Trash2 aria-hidden="true" />
              Очистить историю
            </Button>
          )}
        </div>

        {historyLoading ? (
          <Card><CardContent role="status" className="flex min-h-48 items-center justify-center gap-2 text-slate-600"><Loader2 className="animate-spin" aria-hidden="true" />Загрузка истории…</CardContent></Card>
        ) : loadError ? (
          <Card className="border-red-200">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-4 p-6 text-center">
              <AlertCircle className="text-red-600" aria-hidden="true" />
              <p role="alert" className="font-medium text-red-700">{loadError}</p>
              <Button variant="outline" className="min-h-11" onClick={() => loadHistory(page)}>Повторить</Button>
            </CardContent>
          </Card>
        ) : history.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center text-slate-600">
              <History className="mb-4 h-12 w-12 text-slate-300" aria-hidden="true" />
              <h2 className="text-lg font-bold text-slate-800">История пока пуста</h2>
              <p className="mt-1 text-sm">Завершённые игры появятся здесь.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {history.map((game) => (
              <Card key={game.id} className="border-slate-200 shadow-sm">
                <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
                  <div className="min-w-0 space-y-2">
                    <time role="time" dateTime={game.createdAt} className="block text-sm text-slate-500">
                      {historyDateFormatter.format(new Date(game.createdAt))}
                    </time>
                    <GameHistoryResult game={game} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1 sm:text-right">
                    <div>
                      <dt className="text-xs text-slate-500">Код комнаты</dt>
                      <dd className="break-all font-mono font-semibold text-slate-800">{game.roomCode}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Участники</dt>
                      <dd className="inline-flex items-center gap-1 text-slate-600 sm:justify-end">
                        <Users aria-hidden="true" />
                        Участников: {game.participants}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!historyLoading && !loadError && totalPages > 1 && (
          <nav aria-label="Страницы истории" className="flex items-center justify-between gap-3">
            <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => loadHistory(page - 1)}>Назад</Button>
            <p aria-live="polite" className="text-center text-sm text-slate-600">Страница {page} из {totalPages}</p>
            <Button variant="outline" className="min-h-11" disabled={page >= totalPages} onClick={() => loadHistory(page + 1)}>Вперёд</Button>
          </nav>
        )}
      </div>

      <Dialog open={clearOpen} onOpenChange={(open) => {
        setClearOpen(open);
        if (!open) {
          setConfirmation('');
          setClearError('');
        }
      }}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Очистить историю?</DialogTitle>
            <DialogDescription>Все записи об итогах ваших игр будут удалены без возможности восстановления.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="clear-history-confirmation">Введите ОЧИСТИТЬ</Label>
            <Input id="clear-history-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </div>
          {clearError && <p role="alert" className="text-sm font-medium text-red-700">{clearError}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setClearOpen(false)} disabled={clearing}>Отмена</Button>
            <Button variant="destructive" className="min-h-11 w-full bg-red-700 hover:bg-red-800 sm:w-auto" onClick={handleClear} disabled={confirmation !== 'ОЧИСТИТЬ' || clearing}>
              {clearing ? 'Удаление…' : 'Удалить всю историю'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
