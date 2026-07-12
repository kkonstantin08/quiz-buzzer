import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../realtime/socket';
import { RoomState, type RoomData } from 'shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { QrCode, Timer, Crown, LogOut, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSound } from '../lib/sounds';
import { api, BASE_URL } from '../services/api';
import { useAriaLive } from '../lib/AriaLiveContext';

export function HostRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [room, setRoom] = useState<RoomData | null>(location.state?.room || null);
  const [reconnectState, setReconnectState] = useState<'restoring' | 'connected' | 'revoked' | 'unavailable'>('restoring');
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [firstBuzzerName, setFirstBuzzerName] = useState<string>('');
  const [qrOpen, setQrOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{winnerName: string | null, winnerScore: number} | null>(null);
  const soundSettingsRef = React.useRef({ enabled: true, theme: 'classic' });
  const announce = useAriaLive();

  useEffect(() => {
    api.getSettings()
      .then(s => {
        soundSettingsRef.current = { enabled: s.soundEnabled, theme: s.soundTheme || 'classic' };
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!roomId) {
      setReconnectState('unavailable');
      setReconnectError('Идентификатор игры отсутствует.');
      return;
    }

    const performRejoin = () => {
      setReconnectState('restoring');
      
      if (!socket.connected) {
        socket.connect();
      }

      socket.emit('HOST_REJOIN_ROOM', { roomId }, (res) => {
        if (res.success && res.room) {
          setRoom(res.room);
          setReconnectState('connected');
          announce('Вы успешно подключились к игре как ведущий');
        } else {
          setReconnectState('unavailable');
          setReconnectError(res.error || 'Игра недоступна');
          announce(res.error || 'Игра недоступна', 'assertive');
        }
      });
    };

    if (!room) {
      performRejoin();
    } else {
      setReconnectState('connected');
    }

    const onConnect = () => {
      performRejoin();
    };

    const onControlRevoked = () => {
      setReconnectState('revoked');
      announce('Управление отозвано. Открыто с другого устройства.', 'assertive');
    };

    socket.on('connect', onConnect);
    socket.on('HOST_CONTROL_REVOKED', onControlRevoked);

    return () => {
      socket.off('connect', onConnect);
      socket.off('HOST_CONTROL_REVOKED', onControlRevoked);
    };
  }, [roomId]);

  useEffect(() => {
    const onStateUpdate = (updatedRoom: RoomData) => {
      const prevRoom = room;
      setRoom(updatedRoom);

      if (updatedRoom.roundState === RoomState.REVEALED && updatedRoom.firstBuzzerId) {
        const p = updatedRoom.participants.find(p => p.id === updatedRoom.firstBuzzerId);
        setFirstBuzzerName(p ? p.displayName : 'Неизвестный участник');
        
        if (prevRoom?.roundState !== RoomState.REVEALED) {
          playSound('buzz', soundSettingsRef.current.theme, soundSettingsRef.current.enabled);
          announce(`Первым нажал: ${p ? p.displayName : 'Неизвестный участник'}`);
        }
      } else if (updatedRoom.roundState === RoomState.WAITING || updatedRoom.roundState === RoomState.ACTIVE) {
        setFirstBuzzerName('');
      }

      if (updatedRoom.roundState === RoomState.ACTIVE && prevRoom?.roundState !== RoomState.ACTIVE) {
        announce('Раунд запущен. Игроки могут нажимать на пульты.');
      }

      if (updatedRoom.roundState === RoomState.FINISHED && prevRoom?.roundState !== RoomState.FINISHED) {
        let winnerName: string | null = null;
        let winnerScore = 0;
        if (updatedRoom.participants.length > 0) {
          const sorted = [...updatedRoom.participants].sort((a, b) => b.score - a.score);
          winnerScore = sorted[0].score;
          if (winnerScore > 0) winnerName = sorted[0].displayName;
        }
        setWinnerInfo({ winnerName, winnerScore });

        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
          });
        }
        playSound('fanfare', soundSettingsRef.current.theme, soundSettingsRef.current.enabled);
        announce(`Игра завершена. Победитель: ${winnerName || 'никто'}.`);
      }
    };

    socket.on('ROOM_STATE_UPDATED', onStateUpdate);

    return () => {
      socket.off('ROOM_STATE_UPDATED', onStateUpdate);
    };
  }, [room]);

  if (reconnectState === 'restoring') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 text-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
        <h1 className="text-2xl font-bold text-slate-800">Восстанавливаем игру…</h1>
      </div>
    );
  }

  if (reconnectState === 'revoked') {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-slate-50 p-6">
        <Card className="max-w-lg w-full text-center py-8 border-0 shadow-xl bg-white">
          <CardContent className="space-y-6 flex flex-col items-center pt-6">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center animate-pulse">
              <Crown className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-slate-800 tracking-tight animate-bounce">Управление отозвано</h1>
              <p className="text-slate-600 text-lg leading-relaxed">
                Управление игрой перенесено в другую вкладку или на другое устройство.
              </p>
            </div>
            <Button size="lg" className="w-full h-14 font-bold" onClick={() => navigate('/dashboard')}>
              Вернуться на главную
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (reconnectState === 'unavailable' || !room) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-slate-50 p-6">
        <Card className="max-w-lg w-full text-center py-8 border-0 shadow-xl bg-white">
          <CardContent className="space-y-6 flex flex-col items-center pt-6">
            <div className="w-20 h-20 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
              <Crown className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">Игра недоступна</h1>
              <p className="text-slate-600 text-lg leading-relaxed">
                {reconnectError || 'Не удалось загрузить или восстановить сессию игры.'}
              </p>
            </div>
            <Button size="lg" className="w-full h-14 font-bold" onClick={() => navigate('/dashboard')}>
              На главную
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const publicUrl = window.location.origin;
  const joinUrl = `${publicUrl}/room/${room.roomCode}`;

  const handleStartRound = () => socket.emit('ROUND_START');
  const handleReveal = () => socket.emit('FIRST_REVEAL');
  const handleReset = (winnerId: string | null = null) => {
    socket.emit('ROUND_RESET', { winnerId });
  };
  
  const handleCorrect = () => {
    playSound('correct', soundSettingsRef.current.theme, soundSettingsRef.current.enabled);
    handleReset(room.firstBuzzerId);
  };
  
  const handleWrong = () => {
    playSound('wrong', soundSettingsRef.current.theme, soundSettingsRef.current.enabled);
    handleReset(null);
  };

  const handleClearScoreboard = () => {
    if (!roomId) return;
    socket.emit('HOST_CLEAR_SCORES', { roomId });
  };

  const handleCopy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(joinUrl);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = joinUrl;
      textArea.style.position = "absolute";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinishRoom = () => {
    socket.emit('ROOM_FINISH');
    setFinishOpen(false);
  };

  if (room.roundState === RoomState.FINISHED && winnerInfo) {
    if (room.participants.length === 0) {
      return (
        <main id="main-content" tabIndex={-1} className="dashboard-container flex items-center justify-center min-h-[100dvh]">
          <Card className="max-w-lg w-full text-center py-12 border-0 shadow-2xl shadow-slate-500/10 bg-slate-50">
            <CardContent className="space-y-6 flex flex-col items-center">
              <div className="w-24 h-24 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center shadow-inner">
                <LogOut className="w-10 h-10 ml-1" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Игра завершена</h1>
                <p className="text-lg text-slate-600">В игре так и не появилось участников. Эта игра не будет сохранена в статистике.</p>
              </div>
              <Button size="lg" className="mt-8 w-full h-14 text-lg font-bold" onClick={() => navigate('/dashboard')}>
                На главную
              </Button>
            </CardContent>
          </Card>
        </main>
      );
    }

    return (
      <main id="main-content" tabIndex={-1} className="dashboard-container flex items-center justify-center min-h-[100dvh]">
        <Card className="max-w-lg w-full text-center py-12 border-0 shadow-2xl shadow-yellow-500/20 bg-gradient-to-b from-yellow-50 to-white">
          <CardContent className="space-y-6 flex flex-col items-center">
            <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center animate-bounce shadow-inner">
              <Crown className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-black text-slate-800 tracking-tight">Игра завершена!</h1>
              <p className="text-lg text-slate-600">Спасибо за участие</p>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 w-full mt-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-600 tracking-wide mb-2">Победитель</p>
              <h2 className="text-3xl font-bold text-primary break-words">
                {winnerInfo.winnerName}
              </h2>
              <div className="mt-4 inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-yellow-100 text-yellow-700 font-bold text-lg">
                {winnerInfo.winnerScore} {winnerInfo.winnerScore === 1 ? 'балл' : winnerInfo.winnerScore > 1 && winnerInfo.winnerScore < 5 ? 'балла' : 'баллов'}
              </div>
            </div>

            <Button size="lg" className="mt-8 w-full h-14 text-lg font-bold" onClick={() => navigate('/dashboard')}>
              На главную
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Background styles based on theme
  let bgClass = "min-h-[100dvh] bg-slate-50";
  let bgStyle: React.CSSProperties = {};
  let showOverlay = false;

  if (room.customBgUrl) {
    bgClass = "min-h-[100dvh] bg-cover bg-center bg-no-repeat relative";
    bgStyle = { backgroundImage: `url(${room.customBgUrl.startsWith('http') ? room.customBgUrl : `${BASE_URL.replace('/api', '')}${room.customBgUrl}`})` };
    showOverlay = true;
  } else if (room.bgTheme === 'dark') {
    bgClass = "min-h-[100dvh] bg-slate-950 text-slate-100";
  } else if (room.bgTheme === 'violet-fuchsia') {
    bgClass = "min-h-[100dvh] bg-gradient-to-br from-violet-950 via-slate-900 to-fuchsia-950 text-slate-100";
  }

  const isDarkTheme = room.bgTheme === 'dark' || room.bgTheme === 'violet-fuchsia' || !!room.customBgUrl;

  // Start Round Button classes
  const isStartDisabled = room.participants.length === 0;
  let startBtnClass = "w-full text-xl h-16 transition-all duration-300 font-bold ";

  if (isDarkTheme) {
    if (isStartDisabled) {
      startBtnClass += "!bg-white/5 !border !border-white/10 !text-white/20 !shadow-none cursor-not-allowed";
    } else {
      if (room.bgTheme === 'violet-fuchsia') {
        startBtnClass += "!bg-gradient-to-r !from-violet-600 !to-fuchsia-600 hover:!from-violet-500 hover:!to-fuchsia-500 !text-white !shadow-xl !shadow-fuchsia-500/20 border-0";
      } else {
        startBtnClass += "!bg-violet-600 hover:!bg-violet-500 !text-white !shadow-xl !shadow-violet-500/20 border-0";
      }
    }
  } else {
    // Light theme
    if (isStartDisabled) {
      startBtnClass += "!bg-slate-100 !text-slate-400 !border !border-slate-200/60 !shadow-none cursor-not-allowed opacity-60";
    } else {
      startBtnClass += "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20";
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className={bgClass} style={bgStyle}>
      {showOverlay && <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-0" />}
      <div className="relative z-10 dashboard-container">
      
      {/* Mobile-optimized Header with Room Code and QR Button */}
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 p-4 rounded-2xl border ${
        isDarkTheme 
          ? "bg-slate-900/60 border-slate-800/80 text-white backdrop-blur-md shadow-lg" 
          : "bg-white border-slate-200 text-slate-900 shadow-sm"
      }`}>
        <div className="flex items-center gap-4 flex-col sm:flex-row text-center sm:text-left">
          {room.customLogoUrl && (
            <img 
              src={room.customLogoUrl.startsWith('http') ? room.customLogoUrl : `${BASE_URL.replace('/api', '')}${room.customLogoUrl}`} 
              alt="Logo" 
              className="max-h-12 object-contain" 
            />
          )}
          <div className="flex items-center h-full">
            <h1 className={`text-3xl font-bold tracking-wide leading-none ${
              room.bgTheme === 'violet-fuchsia' 
                ? "text-fuchsia-400" 
                : isDarkTheme 
                  ? "text-white" 
                  : "text-primary"
            }`}>
              Игра активна
            </h1>
          </div>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="lg" 
                className={`h-14 gap-2 flex-1 sm:flex-none px-3 sm:px-8 ${
                  isDarkTheme 
                    ? "!bg-transparent border-slate-700 hover:bg-slate-800 text-white hover:text-white" 
                    : ""
                }`}
              >
                <QrCode className="w-5 h-5" />
                QR-код
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md flex flex-col items-center">
              <DialogHeader>
                <DialogTitle className="text-center text-2xl font-bold">Пригласить игроков</DialogTitle>
                <DialogDescription className="text-left text-slate-600">
                  Дайте участникам отсканировать этот QR-код для входа
                </DialogDescription>
              </DialogHeader>
              <div className="bg-white p-4 rounded-xl shadow-inner my-4">
                <QRCodeSVG value={joinUrl} size={250} />
              </div>
              <div className="flex gap-2 w-full mt-2">
                <Input value={joinUrl} readOnly className="bg-muted" />
                <Button 
                  onClick={handleCopy} 
                  variant={copied ? "default" : "secondary"}
                  className={copied ? "bg-green-600 hover:bg-green-700 text-white transition-colors" : ""}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Скопировано!
                    </>
                  ) : (
                    "Копировать"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="lg" className="h-14 gap-2 flex-1 sm:flex-none px-3 sm:px-8">
                <LogOut className="w-5 h-5" />
                Завершить
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-red-600 flex items-center gap-2">
                  <LogOut size={20} />
                  Завершить игру?
                </DialogTitle>
                <DialogDescription>
                  Вы уверены, что хотите завершить эту игру? Это действие нельзя отменить, статистика будет сохранена, а победитель определен немедленно.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2 mt-4 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setFinishOpen(false)} className="w-full sm:w-auto">
                  Отмена
                </Button>
                <Button type="button" variant="destructive" onClick={handleFinishRoom} className="w-full sm:w-auto">
                  Завершить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content Grid (Mobile First: Controls on top) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {/* Primary Controls */}
        <Card className={`min-h-[300px] flex flex-col items-center justify-center shadow-lg border-t-4 border-t-primary order-1 ${
          isDarkTheme 
            ? "bg-slate-900/60 border-slate-800/80 text-white backdrop-blur-md" 
            : "bg-white/80 border-slate-200 text-slate-900 backdrop-blur"
        }`}>
          
          {room.roundState === RoomState.WAITING && (
            <div className="text-center space-y-6 w-full px-6">
              {room.participants.length === 0 ? (
                <div className="space-y-4 py-4">
                  <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center animate-pulse ${
                    isDarkTheme ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"
                  }`}>
                    <QrCode className="w-8 h-8" />
                  </div>
                  <h2 className={`text-xl font-medium animate-pulse ${
                    isDarkTheme ? "text-slate-300" : "text-slate-600"
                  }`}>
                    Ожидание подключения игроков...
                  </h2>
                </div>
              ) : (
                <h2 className={`text-2xl font-semibold ${
                  isDarkTheme ? "text-slate-200" : "text-slate-600"
                }`}>
                  Ожидание запуска раунда
                </h2>
              )}
              <Button 
                size="lg" 
                className={startBtnClass}
                onClick={handleStartRound}
                disabled={isStartDisabled}
              >
                СТАРТ РАУНДА
              </Button>
            </div>
          )}

          {room.roundState === RoomState.ACTIVE && (
            <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300 w-full px-6">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse ${
                isDarkTheme ? "bg-green-950/50 text-green-400" : "bg-green-100 text-green-600"
              }`}>
                <Timer className="w-12 h-12" />
              </div>
              <h2 className={`text-3xl font-bold ${
                isDarkTheme ? "text-green-400" : "text-green-600"
              }`}>
                Раунд активен
              </h2>
              <p className={isDarkTheme ? "text-slate-350" : "text-slate-600"}>Ждем нажатия кнопок...</p>
            </div>
          )}

          {room.roundState === RoomState.REVEALED && (
            <div className="text-center space-y-6 animate-in zoom-in duration-300 w-full px-6">
              <h2 className={`text-2xl font-semibold ${isDarkTheme ? "text-slate-300" : "text-slate-600"}`}>
                Первым нажал:
              </h2>
              <div className={`text-4xl font-black py-2 break-words ${
                room.bgTheme === 'violet-fuchsia' 
                  ? "text-fuchsia-400" 
                  : isDarkTheme 
                    ? "text-violet-400" 
                    : "text-primary"
              }`}>
                {firstBuzzerName}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <Button size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white h-16 text-lg shadow-lg shadow-green-600/20" onClick={handleCorrect}>
                  Верно (+1)
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className={`w-full h-16 text-lg ${
                    isDarkTheme 
                      ? "!bg-transparent border-slate-700 hover:bg-slate-800 text-white hover:text-white" 
                      : ""
                  }`} 
                  onClick={handleWrong}
                >
                  Мимо
                </Button>
              </div>
            </div>
          )}

        </Card>

        {/* Participants Table */}
        <Card className={`shadow-lg order-2 ${
          isDarkTheme 
            ? "bg-slate-900/60 border-slate-800/80 text-white backdrop-blur-md" 
            : "bg-white/80 border-slate-200 text-slate-900 backdrop-blur"
        }`}>
          <CardHeader>
            <CardTitle className={isDarkTheme ? "text-white" : ""}>Участники ({room.participants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {room.participants.length === 0 ? (
              <div className={`text-center py-8 ${isDarkTheme ? "text-slate-400" : "text-slate-600"}`}>
                Пока никого нет
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={isDarkTheme ? "border-slate-800/80 hover:bg-transparent" : ""}>
                      <TableHead className={`w-12 ${isDarkTheme ? "text-slate-400" : ""}`}>#</TableHead>
                      <TableHead className={isDarkTheme ? "text-slate-400" : ""}>Имя</TableHead>
                      <TableHead className={`text-right ${isDarkTheme ? "text-slate-400" : ""}`}>Баллы</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {room.participants.map((p, i) => (
                      <TableRow key={p.id} className={isDarkTheme ? "border-slate-800/80 hover:bg-slate-800/30" : ""}>
                        <TableCell className={`font-medium ${isDarkTheme ? "text-slate-400" : "text-slate-600"}`}>{i + 1}</TableCell>
                        <TableCell className={`font-semibold ${isDarkTheme ? "text-slate-200" : "text-slate-900"}`}>{p.displayName}</TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={p.score > 0 ? "default" : "secondary"} 
                            className={`text-sm px-3 py-1 ${
                              isDarkTheme && p.score <= 0 
                                ? "bg-slate-800 text-slate-300 hover:bg-slate-700" 
                                : ""
                            }`}
                          >
                            {p.score ?? 0}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </main>
  );
}
