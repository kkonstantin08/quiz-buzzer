import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../realtime/socket';
import { timeSync } from '../realtime/timeSync';
import { api, BASE_URL } from '../services/api';
import { RoomState, type RoomData } from 'shared';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Crown } from 'lucide-react';

export function ParticipantRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [name, setName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [amIFirst, setAmIFirst] = useState(false);
  const [isBuzzedLocal, setIsBuzzedLocal] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{winnerName: string | null, winnerScore: number} | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [unlockReady, setUnlockReady] = useState(false);

  useEffect(() => {
    if (room?.roundState === RoomState.ACTIVE && room.unlockAt) {
      const delay = room.unlockAt - timeSync.getServerTime();
      if (delay > 0) {
        setUnlockReady(false);
        const timer = setTimeout(() => {
          setUnlockReady(true);
        }, delay);
        return () => clearTimeout(timer);
      } else {
        setUnlockReady(true);
      }
    } else {
      setUnlockReady(false);
    }
  }, [room?.roundState, room?.unlockAt]);

  useEffect(() => {
    if (roomCode) {
      fetch(`${BASE_URL.replace('/api', '')}/api/rooms/info/${roomCode}`)
        .then(res => res.json())
        .then(data => {
           if (data.customLogoUrl) {
             const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
             const fullUrl = data.customLogoUrl.startsWith('http') ? data.customLogoUrl : `${cleanBaseUrl.replace('/api', '')}${data.customLogoUrl}`;
             setLogoUrl(fullUrl);
           }
        })
        .catch(console.error);
    }
  }, [roomCode]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    
    const onDisconnect = () => {
      setRoom(null); // Reset room on disconnect to force rejoin
    };
    
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsJoining(true);
    setError('');
    
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('ROOM_JOIN', { roomCode: roomCode || '', displayName: name }, (res: { success: boolean, room?: RoomData, error?: string }) => {
      setIsJoining(false);
      if (res.success && res.room) {
        setRoom(res.room);
      } else {
        setError(res.error || 'Ошибка подключения. Возможно, комната не существует.');
      }
    });
  };

  useEffect(() => {
    if (!room) return;

    const onStateUpdate = (updatedRoom: RoomData) => {
      setRoom(updatedRoom);
      if (updatedRoom.roundState === RoomState.WAITING || updatedRoom.roundState === RoomState.ACTIVE) {
        setAmIFirst(false);
        setIsBuzzedLocal(false);
      }
    };

    socket.on('ROOM_STATE_UPDATED', onStateUpdate);
    
    socket.on('ROUND_LOCKED', () => {
      setRoom(prev => prev ? { ...prev, roundState: RoomState.BUZZED_HIDDEN } : null);
    });

    socket.on('ROOM_FINISHED', (data) => {
      setWinnerInfo(data);
    });

    socket.on('FIRST_REVEALED', (firstBuzzerId: string) => {
      if (firstBuzzerId === socket.id) {
        setAmIFirst(true);
      } else {
        setAmIFirst(false);
      }
    });

    return () => {
      socket.off('ROOM_STATE_UPDATED', onStateUpdate);
      socket.off('ROUND_LOCKED');
      socket.off('ROOM_FINISHED');
      socket.off('FIRST_REVEALED');
    };
  }, [room]);

  const handleBuzz = (e?: React.PointerEvent) => {
    const isEffectivelyActive = room?.roundState === RoomState.ACTIVE && (!room.unlockAt || unlockReady);
    if (!isEffectivelyActive || isBuzzedLocal) return;
    
    // Trigger vibration for immediate haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    setIsBuzzedLocal(true);
    
    const timestamp = timeSync.getServerTime();
    
    // @ts-ignore
    socket.emit('BUZZ_SUBMIT', { timestamp }, (res: any) => {
      // The server callback will arrive after the 250ms buffer.
      // But we mostly rely on FIRST_REVEALED broadcast to show results.
      if (res && res.success) {
        // Just in case it's processed quickly or FIRST_REVEALED is missed
        setAmIFirst(true);
      }
    });
  };

  if (room?.roundState === RoomState.FINISHED && winnerInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-6 text-center">
        <Crown className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Игра окончена</h2>
        <p className="text-slate-600 mb-6">Ведущий завершил эту игру.</p>
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 w-full max-w-sm">
          <p className="text-xs font-semibold text-slate-600 tracking-wide mb-1">Победитель</p>
          <p className="text-2xl font-bold text-primary break-words">{winnerInfo.winnerName}</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="max-h-16 object-contain mb-8" />
        ) : (
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-8">КвизПульт</h1>
        )}
        <Card className="w-full max-w-md shadow-lg border-0 bg-white">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">Вход в игру</CardTitle>
            <CardDescription>Введите ваше имя, чтобы присоединиться</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {error && <div className="text-red-500 text-sm mb-4 text-center bg-red-50 p-3 rounded-md font-medium border border-red-100">{error}</div>}
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  placeholder="Ваше имя"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={20}
                  required
                  className="h-14 text-lg text-center font-semibold"
                />
              </div>
              <Button type="submit" className="w-full h-14 text-lg shadow-lg shadow-primary/20" disabled={isJoining || !name.trim()}>
                {isJoining ? 'Подключение...' : 'Войти в игру'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEffectivelyActive = room.roundState === RoomState.ACTIVE && (!room.unlockAt || unlockReady);
  const isWaiting = room.roundState === RoomState.WAITING || (room.roundState === RoomState.ACTIVE && !isEffectivelyActive);
  const isActive = isEffectivelyActive;
  const isLocked = room.roundState === RoomState.BUZZED_HIDDEN || room.roundState === RoomState.REVEALED;

  let btnColor = "bg-slate-400";
  let shadowColor = "shadow-slate-500/50";
  let statusText = '';
  let glow = false;

  if (isWaiting) {
    btnColor = "bg-blue-500";
    shadowColor = "shadow-blue-600/50";
    statusText = 'Ожидайте старта';
  } else if (isActive) {
    btnColor = "bg-red-500";
    shadowColor = "shadow-red-600/50";
    statusText = isBuzzedLocal ? '' : 'ЖМИТЕ!';
    glow = true;
  } else if (isLocked) {
    if (amIFirst) {
      btnColor = "bg-green-500";
      shadowColor = "shadow-green-600/50";
      statusText = 'Вы нажали первым!\nОжидайте ответа';
      glow = true;
    } else {
      btnColor = "bg-slate-700";
      shadowColor = "shadow-slate-800/50";
      statusText = 'Кнопка заблокирована\nКто-то успел раньше';
    }
  }

  return (
    <div className="flex flex-col items-center min-h-[100dvh] bg-slate-50 p-4 overflow-hidden touch-none relative">
      
      {/* Header Logo */}
      <div className="absolute top-6 left-0 right-0 flex justify-center w-full px-4 z-20">
        {logoUrl || room?.customLogoUrl ? (
          <img 
            src={logoUrl || (room?.customLogoUrl ? (room.customLogoUrl.startsWith('http') ? room.customLogoUrl : `${BASE_URL.replace('/api', '')}${room.customLogoUrl}`) : '')} 
            alt="Logo" 
            className="max-h-12 object-contain" 
          />
        ) : (
          <span className="font-black text-2xl text-slate-800/80">КвизПульт</span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] flex items-center justify-center">
        {/* Animated Glow behind the button */}
        <AnimatePresence>
          {glow && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
              className={`absolute inset-0 rounded-full blur-3xl ${amIFirst && isLocked ? 'bg-green-500/40' : 'bg-red-500/30'}`}
            />
          )}
        </AnimatePresence>

        <motion.button
          className={`relative z-10 w-full h-full rounded-full text-white text-4xl font-bold tracking-widest shadow-[0_20px_50px_rgba(8,_112,_184,_0.7)] ${btnColor}`}
          style={{ 
            boxShadow: (isActive || (isLocked && amIFirst)) ? `0 20px 40px -10px ${amIFirst ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'}, inset 0 -10px 20px rgba(0,0,0,0.2), inset 0 10px 20px rgba(255,255,255,0.3)` 
                               : `0 20px 40px -10px rgba(0,0,0,0.3), inset 0 -10px 20px rgba(0,0,0,0.2), inset 0 10px 20px rgba(255,255,255,0.2)`
          }}
          animate={isBuzzedLocal && isActive ? { scale: 0.9 } : { scale: 1 }}
          whileHover={(isActive && !isBuzzedLocal) || (isLocked && amIFirst) ? { scale: 1.05 } : {}}
          whileTap={(isActive && !isBuzzedLocal) ? { scale: 0.9, y: 10 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          onPointerDown={handleBuzz}
          disabled={!isActive || isBuzzedLocal}
        >
          {isActive && !isBuzzedLocal ? 'ЖМИ!' : ''}
        </motion.button>
      </div>

      <motion.div 
        key={statusText}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-12 text-2xl font-semibold text-slate-600 text-center whitespace-pre-line"
      >
        {statusText}
      </motion.div>
      </div>
    </div>
  );
}
