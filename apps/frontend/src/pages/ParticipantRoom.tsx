import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../realtime/socket";
import { timeSync } from "../realtime/timeSync";
import { api, BASE_URL } from "../services/api";
import { RoomState, type RoomData } from "shared";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Crown } from "lucide-react";
import { useAriaLive } from "../lib/AriaLiveContext";

export function ParticipantRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [amIFirst, setAmIFirst] = useState(false);
  const [isBuzzedLocal, setIsBuzzedLocal] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{
    winnerName: string | null;
    winnerScore: number;
  } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [unlockReady, setUnlockReady] = useState(false);
  const [isHostDisconnected, setIsHostDisconnected] = useState(false);
  const [roomClosedReason, setRoomClosedReason] = useState<string | null>(null);
  const announce = useAriaLive();
  const buzzTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReduceMotion = useReducedMotion();

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
      fetch(`${BASE_URL.replace("/api", "")}/api/rooms/info/${roomCode}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.customLogoUrl) {
            const cleanBaseUrl = BASE_URL.endsWith("/")
              ? BASE_URL.slice(0, -1)
              : BASE_URL;
            const fullUrl = data.customLogoUrl.startsWith("http")
              ? data.customLogoUrl
              : `${cleanBaseUrl.replace("/api", "")}${data.customLogoUrl}`;
            setLogoUrl(fullUrl);
          }
        })
        .catch(console.error);
    }
  }, [roomCode]);

  useEffect(() => {
    const tryRejoin = () => {
      const savedSession = localStorage.getItem(`quiz_participant_${roomCode}`);
      if (savedSession) {
        try {
          const { participantId, reconnectToken } = JSON.parse(savedSession);
          socket.emit(
            "PARTICIPANT_REJOIN",
            { roomCode: roomCode || "", participantId, reconnectToken },
            (res: any) => {
              if (res.success && res.room && res.participant) {
                setRoom(res.room);
                setName(res.participant.displayName);
              } else {
                localStorage.removeItem(`quiz_participant_${roomCode}`);
                setRoom(null);
              }
            },
          );
        } catch (e) {
          localStorage.removeItem(`quiz_participant_${roomCode}`);
        }
      }
    };

    const onConnect = () => {
      tryRejoin();
    };

    const onDisconnect = () => {
      const savedSession = localStorage.getItem(`quiz_participant_${roomCode}`);
      if (!savedSession) {
        setRoom(null);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected) {
      tryRejoin();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [roomCode]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsJoining(true);
    setError("");

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit(
      "ROOM_JOIN",
      { roomCode: roomCode || "", displayName: name },
      (res: any) => {
        setIsJoining(false);
        if (res.success && res.room) {
          setRoom(res.room);
          announce("Вы успешно вошли в игру");
          if (res.participant?.id && res.reconnectToken) {
            localStorage.setItem(
              `quiz_participant_${roomCode}`,
              JSON.stringify({
                participantId: res.participant.id,
                reconnectToken: res.reconnectToken,
              }),
            );
          }
        } else {
          setError(
            res.error || "Ошибка подключения. Возможно, игра не существует.",
          );
          announce(res.error || "Ошибка подключения", "assertive");
        }
      },
    );
  };

  useEffect(() => {
    if (!room) return;

    const onStateUpdate = (updatedRoom: RoomData) => {
      const prevRoom = room;
      setRoom(updatedRoom);

      if (
        updatedRoom.roundState === RoomState.WAITING ||
        updatedRoom.roundState === RoomState.ACTIVE
      ) {
        setAmIFirst(false);
        setIsBuzzedLocal(false);
      }

      if (
        updatedRoom.roundState === RoomState.ACTIVE &&
        prevRoom?.roundState !== RoomState.ACTIVE
      ) {
        announce("Раунд начат! Жмите кнопку.");
      }

      if (
        updatedRoom.roundState === RoomState.REVEALED &&
        prevRoom?.roundState !== RoomState.REVEALED
      ) {
        const firstP = updatedRoom.participants.find(
          (p) => p.id === updatedRoom.firstBuzzerId,
        );
        const myParticipant = updatedRoom.participants.find(
          (p) => p.socketId === socket.id,
        );

        if (myParticipant && updatedRoom.firstBuzzerId === myParticipant.id) {
          setAmIFirst(true);
          announce("Вы нажали первым!");
        } else {
          setAmIFirst(false);
          if (firstP) announce(`Первым нажал: ${firstP.displayName}`);
        }
      }

      if (
        updatedRoom.roundState === RoomState.FINISHED &&
        prevRoom?.roundState !== RoomState.FINISHED
      ) {
        let winnerName: string | null = null;
        let winnerScore = 0;
        if (updatedRoom.participants.length > 0) {
          const sorted = [...updatedRoom.participants].sort(
            (a, b) => b.score - a.score,
          );
          winnerScore = sorted[0].score;
          if (winnerScore > 0) winnerName = sorted[0].displayName;
        }
        setWinnerInfo({ winnerName, winnerScore });
        announce(
          `Игра завершена. Победитель: ${winnerName || "Нет победителя"}`,
        );
      }

      if (
        updatedRoom.isHostConnected === false &&
        prevRoom?.isHostConnected !== false
      ) {
        announce("Ведущий отключился. Ожидаем восстановления...", "assertive");
      } else if (
        updatedRoom.isHostConnected === true &&
        prevRoom?.isHostConnected === false
      ) {
        announce("Ведущий вернулся в игру");
      }

      setIsHostDisconnected(!updatedRoom.isHostConnected);
    };

    socket.on("ROOM_STATE_UPDATED", onStateUpdate);

    socket.on("ROOM_CLOSED", (data) => {
      localStorage.removeItem(`quiz_participant_${roomCode}`);
      setRoomClosedReason(data.reason);
      setRoom(null);
    });

    socket.on("PARTICIPANT_CONTROL_REVOKED", () => {
      localStorage.removeItem(`quiz_participant_${roomCode}`);
      setRoom(null);
      setError("Вы вошли с другого устройства или вкладки");
      announce(
        "Управление отозвано. Вы вошли с другого устройства или вкладки",
        "assertive",
      );
    });

    return () => {
      socket.off("ROOM_STATE_UPDATED", onStateUpdate);
      socket.off("ROOM_CLOSED");
      socket.off("PARTICIPANT_CONTROL_REVOKED");
    };
  }, [room, roomCode]);

  const handleBuzz = (
    e?:
      | React.PointerEvent
      | React.MouseEvent
      | React.KeyboardEvent
      | React.TouchEvent,
  ) => {
    // Unified handler that avoids double firing from simulated events
    if (e && "type" in e) {
      if (e.type === "keydown") {
        const keyEvent = e as React.KeyboardEvent;
        if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
        keyEvent.preventDefault(); // Prevents clicking the button again natively
      } else {
        e.preventDefault(); // Prevents default pointer/mouse/touch behaviors that might cause double events
      }
    }

    const isEffectivelyActive =
      room?.roundState === RoomState.ACTIVE && (!room.unlockAt || unlockReady);
    if (!isEffectivelyActive || isBuzzedLocal) return;

    // Prevent double firing within a tiny window
    if (buzzTimeoutRef.current) return;
    buzzTimeoutRef.current = setTimeout(() => {
      buzzTimeoutRef.current = null;
    }, 500);

    // Trigger vibration for immediate haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    setIsBuzzedLocal(true);
    announce("Сигнал отправлен");

    const clientPressedAt = Date.now();

    // @ts-ignore
    socket.emit("BUZZ_SUBMIT", { clientPressedAt }, (res: any) => {
      // The server callback will arrive after the 250ms buffer.
      // But we mostly rely on FIRST_REVEALED broadcast to show results.
      if (res && res.success) {
        // Just in case it's processed quickly or FIRST_REVEALED is missed
        setAmIFirst(true);
        announce("Вы нажали первым!");
      }
    });
  };

  if (roomClosedReason) {
    return (
      <main
        id="main-content"
        className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-6 text-center"
      >
        <Crown className="w-16 h-16 text-slate-400 mb-4" />
        <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
          Игра закрыта
        </h2>
        <p className="text-slate-600 mb-6 font-medium">
          {roomClosedReason === "ведущий не вернулся"
            ? "Игра закрыта: ведущий не вернулся."
            : `Игра закрыта: ${roomClosedReason}`}
        </p>
        <Button
          onClick={() => navigate("/")}
          size="lg"
          className="h-14 px-8 font-bold"
        >
          На главную
        </Button>
      </main>
    );
  }

  if (room?.roundState === RoomState.FINISHED && winnerInfo) {
    return (
      <main
        id="main-content"
        className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-6 text-center"
      >
        <Crown className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-3xl font-black text-slate-800 tracking-tight mb-2">
          Игра окончена
        </h2>
        <p className="text-slate-600 mb-6">Ведущий завершил эту игру.</p>
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 w-full max-w-sm">
          <p className="text-xs font-semibold text-slate-600 tracking-wide mb-1">
            Победитель
          </p>
          <p className="text-2xl font-bold text-primary break-words">
            {winnerInfo.winnerName}
          </p>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main
        id="main-content"
        className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-4"
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Логотип квиза"
            className="max-h-16 object-contain mb-8"
          />
        ) : (
          <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-8">
            КвизПульт
          </h1>
        )}
        <Card className="w-full max-w-md shadow-lg border-0 bg-white">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">Вход в игру</CardTitle>
            <CardDescription>
              Введите ваше имя, чтобы присоединиться
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {error && (
              <div
                role="alert"
                className="text-red-500 text-sm mb-4 text-center bg-red-50 p-3 rounded-md font-medium border border-red-100"
              >
                {error}
              </div>
            )}
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="participant-name" className="sr-only">
                  Ваше имя
                </Label>
                <Input
                  id="participant-name"
                  name="participantName"
                  autoComplete="username"
                  placeholder="Ваше имя"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  required
                  aria-invalid={!!error}
                  className="h-14 text-lg text-center font-semibold"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-14 text-lg shadow-lg shadow-primary/20"
                disabled={isJoining || !name.trim()}
              >
                {isJoining ? "Подключение..." : "Войти в игру"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const isEffectivelyActive =
    room.roundState === RoomState.ACTIVE && (!room.unlockAt || unlockReady);
  const isWaiting =
    room.roundState === RoomState.WAITING ||
    (room.roundState === RoomState.ACTIVE && !isEffectivelyActive);
  const isActive = isEffectivelyActive;
  const isLocked =
    room.roundState === RoomState.BUZZED_HIDDEN ||
    room.roundState === RoomState.REVEALED;

  let btnColor = "bg-slate-400";
  let shadowColor = "shadow-slate-500/50";
  let statusText = "";
  let glow = false;

  if (isWaiting) {
    btnColor = "bg-blue-500";
    shadowColor = "shadow-blue-600/50";
    statusText = "Ожидайте старта";
  } else if (isActive) {
    btnColor = "bg-red-500";
    shadowColor = "shadow-red-600/50";
    statusText = isBuzzedLocal ? "" : "ЖМИТЕ!";
    glow = true;
  } else if (isLocked) {
    if (amIFirst) {
      btnColor = "bg-green-500";
      shadowColor = "shadow-green-600/50";
      statusText = "Вы нажали первым!\nОжидайте ответа";
      glow = true;
    } else {
      btnColor = "bg-slate-700";
      shadowColor = "shadow-slate-800/50";
      statusText = "Кнопка заблокирована\nКто-то успел раньше";
    }
  }

  // Background styles based on theme
  let bgClass =
    "flex flex-col items-center min-h-[100dvh] bg-slate-50 p-4 overflow-hidden touch-none relative";
  let bgStyle: React.CSSProperties = {};
  let showOverlay = false;
  const isDarkBg =
    room?.bgTheme === "dark" ||
    room?.bgTheme === "violet-fuchsia" ||
    !!room?.customBgUrl;

  if (room?.customBgUrl) {
    bgClass =
      "flex flex-col items-center min-h-[100dvh] bg-cover bg-center bg-no-repeat p-4 overflow-hidden touch-none relative";
    bgStyle = {
      backgroundImage: `url(${room.customBgUrl.startsWith("http") ? room.customBgUrl : `${BASE_URL.replace("/api", "")}${room.customBgUrl}`})`,
    };
    showOverlay = true;
  } else if (room?.bgTheme === "dark") {
    bgClass =
      "flex flex-col items-center min-h-[100dvh] bg-slate-950 p-4 overflow-hidden touch-none relative text-slate-100";
  } else if (room?.bgTheme === "violet-fuchsia") {
    bgClass =
      "flex flex-col items-center min-h-[100dvh] bg-gradient-to-br from-violet-950 via-slate-900 to-fuchsia-950 p-4 overflow-hidden touch-none relative text-slate-100";
  }

  return (
    <main id="main-content" className={bgClass} style={bgStyle}>
      {showOverlay && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] z-0" />
      )}

      <div className="relative z-10 w-full flex flex-col items-center flex-1">
        {isHostDisconnected && (
          <div className="w-full bg-amber-500 text-white text-center py-2.5 px-4 font-semibold text-sm animate-pulse z-30 absolute top-0 left-0 right-0">
            Ведущий временно отключён. Ожидаем восстановления соединения.
          </div>
        )}

        {/* Header Logo */}
        <div className="absolute top-12 left-0 right-0 flex justify-center w-full px-4 z-20">
          {logoUrl || room?.customLogoUrl ? (
            <img
              src={
                logoUrl ||
                (room?.customLogoUrl
                  ? room.customLogoUrl.startsWith("http")
                    ? room.customLogoUrl
                    : `${BASE_URL.replace("/api", "")}${room.customLogoUrl}`
                  : "")
              }
              alt="Логотип игры"
              className="max-h-12 object-contain"
            />
          ) : (
            <span
              className={`font-black text-2xl ${isDarkBg ? "text-white/80" : "text-slate-800/80"}`}
            >
              КвизПульт
            </span>
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
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }}
                  className={`absolute inset-0 rounded-full blur-3xl ${amIFirst && isLocked ? "bg-green-500/40" : "bg-red-500/30"}`}
                />
              )}
            </AnimatePresence>

            <motion.button
              className={`relative z-10 w-full h-full rounded-full text-white text-4xl font-bold tracking-widest focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-primary shadow-[0_20px_50px_rgba(8,_112,_184,_0.7)] ${btnColor}`}
              style={{
                boxShadow:
                  isActive || (isLocked && amIFirst)
                    ? `0 20px 40px -10px ${amIFirst ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"}, inset 0 -10px 20px rgba(0,0,0,0.2), inset 0 10px 20px rgba(255,255,255,0.3)`
                    : `0 20px 40px -10px rgba(0,0,0,0.3), inset 0 -10px 20px rgba(0,0,0,0.2), inset 0 10px 20px rgba(255,255,255,0.2)`,
              }}
              animate={
                isBuzzedLocal && isActive && !shouldReduceMotion
                  ? { scale: 0.9 }
                  : { scale: 1 }
              }
              whileHover={
                !shouldReduceMotion &&
                ((isActive && !isBuzzedLocal) || (isLocked && amIFirst))
                  ? { scale: 1.05 }
                  : {}
              }
              whileTap={
                !shouldReduceMotion && isActive && !isBuzzedLocal
                  ? { scale: 0.9, y: 10 }
                  : {}
              }
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onPointerDown={handleBuzz}
              onKeyDown={handleBuzz}
              disabled={!isActive || isBuzzedLocal}
              aria-label="Игровой пульт (Buzzer)"
              aria-describedby="buzzer-status-text"
            >
              {isActive && !isBuzzedLocal ? "ЖМИ!" : ""}
            </motion.button>
          </div>

          <motion.div
            id="buzzer-status-text"
            role="status"
            aria-live="polite"
            key={statusText}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-12 text-2xl font-semibold text-center whitespace-pre-line ${isDarkBg ? "text-slate-200" : "text-slate-600"}`}
          >
            {statusText}
          </motion.div>
        </div>
      </div>
    </main>
  );
}
