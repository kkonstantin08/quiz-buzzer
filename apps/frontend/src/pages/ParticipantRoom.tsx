import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../realtime/socket";
import { timeSync } from "../realtime/timeSync";
import { api, BASE_URL } from "../services/api";
import { resolveAssetUrl } from "../lib/assets";
import { RoomState, GameResult, type PublicRoomData } from "shared";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
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
import { isSocketAuthError, useSocketAuthRecovery } from "../realtime/authRecovery";
import { readParticipantSession, removeParticipantSession, saveParticipantSession } from "../lib/participantSessionStorage";

export function ParticipantRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<PublicRoomData | null>(null);
  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [amIFirst, setAmIFirst] = useState(false);
  const [buzzStatus, setBuzzStatus] = useState<"idle" | "pending" | "accepted">("idle");
  const [winnerInfo, setWinnerInfo] = useState<{
    winnerName: string | null;
    winnerScore: number;
    result: GameResult | null;
  } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [unlockReady, setUnlockReady] = useState(false);
  const [isHostDisconnected, setIsHostDisconnected] = useState(false);
  const [roomClosedReason, setRoomClosedReason] = useState<string | null>(null);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const announce = useAriaLive();
  const buzzTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myParticipantIdRef = useRef<string | null>(null);
  const joinListenersRef = useRef<{
    connect?: () => void;
    connect_error?: (e: Error) => void;
  }>({});
  const roomStateRef = useRef<RoomState | undefined>(undefined);

  useEffect(() => {
    roomStateRef.current = room?.roundState;
  }, [room?.roundState]);

  useEffect(() => {
    return () => {
      joinAttemptIdRef.current += 1;
      joinPendingRef.current = false;
      if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
      if (buzzTimeoutRef.current) clearTimeout(buzzTimeoutRef.current);
      if (joinListenersRef.current.connect) {
        socket.off("connect", joinListenersRef.current.connect);
      }
      if (joinListenersRef.current.connect_error) {
        socket.off("connect_error", joinListenersRef.current.connect_error);
      }
    };
  }, []);
  const roomCodeRef = useRef(roomCode);
  const joinPendingRef = useRef(false);
  const joinAttemptIdRef = useRef<number>(0);
  const shouldReduceMotion = useReducedMotion();

  useSocketAuthRecovery(
    () => { socket.connect(); },
    () => { 
      setIsJoining(false); 
      joinPendingRef.current = false;
      if (joinListenersRef.current.connect) socket.off("connect", joinListenersRef.current.connect);
      if (joinListenersRef.current.connect_error) socket.off("connect_error", joinListenersRef.current.connect_error);
      joinListenersRef.current.connect = undefined;
      joinListenersRef.current.connect_error = undefined;
      setError("Не удалось подключиться к игре. Повторите попытку."); 
    },
  );

  useEffect(() => {
    myParticipantIdRef.current = myParticipantId;
  }, [myParticipantId]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

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
            setLogoUrl(resolveAssetUrl(data.customLogoUrl) || "");
          }
        })
        .catch(console.error);
    }
  }, [roomCode]);

  // Synchronize local UI state with the current room state (crucial for page reloads)
  useEffect(() => {
    if (room) {
      setIsHostDisconnected(!room.isHostConnected);
      if (room.roundState === RoomState.REVEALED && myParticipantId && room.firstBuzzerId === myParticipantId) {
        setAmIFirst(true);
      } else if (room.roundState === RoomState.WAITING || room.roundState === RoomState.ACTIVE) {
        setAmIFirst(false);
      }
    }
  }, [room?.roundState, room?.firstBuzzerId, room?.isHostConnected, myParticipantId]);

  useEffect(() => {
    const tryRejoin = () => {
      const savedSession = readParticipantSession(roomCode);
      if (savedSession) {
        socket.emit(
          "PARTICIPANT_REJOIN",
          { roomCode: roomCode || "", participantId: savedSession.participantId, reconnectToken: savedSession.reconnectToken },
          (res) => {
            if (res.success && res.room && res.participant) {
              setRoom(res.room);
              setName(res.participant.displayName);
              myParticipantIdRef.current = res.participant.id;
              setMyParticipantId(res.participant.id);
            } else {
              removeParticipantSession(roomCode);
              setRoom(null);
            }
          },
        );
      }
    };

    const onConnect = () => {
      tryRejoin();
    };

    const onDisconnect = () => {
      const savedSession = readParticipantSession(roomCode);
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
    if (!name.trim() || joinPendingRef.current) return;

    const attemptId = ++joinAttemptIdRef.current;
    joinPendingRef.current = true;
    setIsJoining(true);
    setError("");

    const emitJoin = () => socket.emit(
      "ROOM_JOIN",
      { roomCode: roomCode || "", displayName: name },
      (res) => {
        if (joinAttemptIdRef.current !== attemptId) return;
        joinPendingRef.current = false;
        setIsJoining(false);
        if (res.success) {
          setRoom(res.room);
          announce("Вы успешно вошли в игру");
          if (res.participant?.id && res.reconnectToken) {
            myParticipantIdRef.current = res.participant.id;
            setMyParticipantId(res.participant.id);
            saveParticipantSession(roomCode, res.participant.id, res.reconnectToken, res.room.createdAt);
          }
        } else {
          setError(
            res.error || "Ошибка подключения. Возможно, игра не существует.",
          );
          announce(res.error || "Ошибка подключения", "assertive");
        }
      },
    );

    if (socket.connected) {
      emitJoin();
      return;
    }

    // Clean up any lingering listeners from a previous uncompleted join attempt
    if (joinListenersRef.current.connect) {
      socket.off("connect", joinListenersRef.current.connect);
    }
    if (joinListenersRef.current.connect_error) {
      socket.off("connect_error", joinListenersRef.current.connect_error);
    }

    const onConnectError = (error: Error) => {
      if (isSocketAuthError(error)) return;
      if (joinListenersRef.current.connect) {
        socket.off("connect", joinListenersRef.current.connect);
      }
      if (joinListenersRef.current.connect_error) {
        socket.off("connect_error", joinListenersRef.current.connect_error);
      }
      joinListenersRef.current.connect = undefined;
      joinListenersRef.current.connect_error = undefined;
      if (joinAttemptIdRef.current === attemptId) {
        joinPendingRef.current = false;
        setIsJoining(false);
        setError("Не удалось подключиться к игре. Повторите попытку.");
      }
    };

    const emitJoinWithCleanup = () => {
      if (joinListenersRef.current.connect_error) {
        socket.off("connect_error", joinListenersRef.current.connect_error);
      }
      if (joinListenersRef.current.connect) {
        socket.off("connect", joinListenersRef.current.connect);
      }
      joinListenersRef.current.connect = undefined;
      joinListenersRef.current.connect_error = undefined;
      emitJoin();
    };

    joinListenersRef.current.connect = emitJoinWithCleanup;
    joinListenersRef.current.connect_error = onConnectError;

    socket.on("connect", emitJoinWithCleanup);
    socket.on("connect_error", onConnectError);
    socket.connect();
  };

  useEffect(() => {
    const onStateUpdate = (updatedRoom: PublicRoomData) => {
      setRoom((previousRoom) => {
        if (updatedRoom.roundState !== RoomState.ACTIVE) {
          if (ackTimeoutRef.current) {
            clearTimeout(ackTimeoutRef.current);
            ackTimeoutRef.current = null;
          }
        }

        if (
          updatedRoom.roundState === RoomState.WAITING ||
          (updatedRoom.roundState === RoomState.ACTIVE && previousRoom?.roundState !== RoomState.ACTIVE)
        ) {
          setAmIFirst(false);
          setBuzzStatus("idle");
        }

        if (
          updatedRoom.roundState === RoomState.ACTIVE &&
          previousRoom?.roundState !== RoomState.ACTIVE
        ) {
          announce("Раунд начат! Жмите кнопку.");
        }

        if (
          updatedRoom.roundState === RoomState.REVEALED &&
          previousRoom?.roundState !== RoomState.REVEALED
        ) {
          const firstParticipant = updatedRoom.participants.find(
            (participant) => participant.id === updatedRoom.firstBuzzerId,
          );
          const currentParticipantId = myParticipantIdRef.current;

          if (
            currentParticipantId &&
            updatedRoom.firstBuzzerId === currentParticipantId
          ) {
            setAmIFirst(true);
            announce("Вы нажали первым!");
          } else {
            setAmIFirst(false);
            if (firstParticipant) {
              announce(`Первым нажал: ${firstParticipant.displayName}`);
            }
          }
        }

        if (
          updatedRoom.roundState === RoomState.FINISHED &&
          previousRoom?.roundState !== RoomState.FINISHED
        ) {
          const result = updatedRoom.gameResult as GameResult;
          let winnerName = updatedRoom.winnerName || null;
          let winnerScore = 0;

          if (result === GameResult.WINNER || result === GameResult.DRAW) {
            const sorted = [...updatedRoom.participants].sort((a, b) => b.score - a.score);
            winnerScore = sorted[0]?.score || 0;
          }

          setWinnerInfo({ winnerName, winnerScore, result: result || GameResult.NO_WINNER });

          if (!shouldReduceMotion) {
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
              colors: ["#ef4444", "#f59e0b", "#3b82f6", "#10b981"],
            });
          }

          if (result === GameResult.WINNER && winnerName) {
            announce(`Игра завершена. Победитель: ${winnerName}.`);
          } else if (result === GameResult.DRAW) {
            announce(`Игра завершена. Ничья.`);
          } else {
            announce(`Игра завершена без победителя.`);
          }
        }

        if (
          updatedRoom.isHostConnected === false &&
          previousRoom?.isHostConnected !== false
        ) {
          announce("Ведущий отключился. Ожидаем восстановления...", "assertive");
        } else if (
          updatedRoom.isHostConnected === true &&
          previousRoom?.isHostConnected === false
        ) {
          announce("Ведущий вернулся в игру");
        }

        setIsHostDisconnected(!updatedRoom.isHostConnected);
        return updatedRoom;
      });
    };

    const onRoomClosed = (data: { reason: string }) => {
      removeParticipantSession(roomCodeRef.current);
      setRoomClosedReason(data.reason);
      setRoom(null);
    };

    const onControlRevoked = () => {
      removeParticipantSession(roomCodeRef.current);
      setRoom(null);
      setError("Вы вошли с другого устройства или вкладки");
      announce(
        "Управление отозвано. Вы вошли с другого устройства или вкладки",
        "assertive",
      );
    };

    socket.on("ROOM_STATE_UPDATED", onStateUpdate);
    socket.on("ROOM_CLOSED", onRoomClosed);
    socket.on("PARTICIPANT_CONTROL_REVOKED", onControlRevoked);

    return () => {
      socket.off("ROOM_STATE_UPDATED", onStateUpdate);
      socket.off("ROOM_CLOSED", onRoomClosed);
      socket.off("PARTICIPANT_CONTROL_REVOKED", onControlRevoked);
    };
  }, []);

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
    if (!isEffectivelyActive || buzzStatus !== "idle") return;

    // Prevent double firing within a tiny window
    if (buzzTimeoutRef.current) return;
    buzzTimeoutRef.current = setTimeout(() => {
      buzzTimeoutRef.current = null;
    }, 500);

    // Trigger vibration for immediate haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    setBuzzStatus("pending");
    announce("Отправляем сигнал…");

    const clientPressedAt = Date.now();

    if (ackTimeoutRef.current) clearTimeout(ackTimeoutRef.current);
    ackTimeoutRef.current = setTimeout(() => {
      ackTimeoutRef.current = null;
      announce("Ошибка сети. Попробуйте еще раз", "assertive");
      if (roomStateRef.current === RoomState.ACTIVE) {
        setBuzzStatus("idle");
      }
    }, 5000);

    socket.emit("BUZZ_SUBMIT", { clientPressedAt }, (res) => {
      if (ackTimeoutRef.current) {
        clearTimeout(ackTimeoutRef.current);
        ackTimeoutRef.current = null;
      } else {
        // If timeout was already cleared (e.g. by ROOM_STATE_UPDATED), ignore this callback
        return;
      }

      if (res && res.success) {
        announce("Сигнал принят. Ожидаем результат");
        setBuzzStatus("accepted");
      } else {
        announce(res?.error || "Ошибка", "assertive");
        if (roomStateRef.current === RoomState.ACTIVE) {
          setBuzzStatus("idle");
        }
      }
    });
  };

  if (roomClosedReason) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
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
        tabIndex={-1}
        className="flex flex-col items-center justify-center min-h-[100dvh] bg-slate-50 p-6 text-center"
      >
        <Card className="w-full max-w-sm shadow-lg border-0 bg-white">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-black text-slate-800 tracking-tight">
              {winnerInfo?.result === GameResult.WINNER ? "Победитель!" : winnerInfo?.result === GameResult.DRAW ? "Ничья!" : "Игра завершена"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-4 flex flex-col items-center">
            {winnerInfo?.result === GameResult.WINNER && winnerInfo?.winnerName ? (
              <>
                <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center shadow-inner mb-2 animate-bounce">
                  <Crown className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-slate-800">
                    {winnerInfo.winnerName}
                  </p>
                  <p className="text-slate-500 font-medium text-lg">
                    Счёт: {winnerInfo.winnerScore}
                  </p>
                </div>
              </>
            ) : winnerInfo?.result === GameResult.DRAW ? (
              <>
                <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-inner mb-2 animate-bounce">
                  <Crown className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <p className="text-slate-600 font-medium text-xl">
                    Победила дружба
                  </p>
                  <p className="text-slate-500 font-medium text-lg">
                    Счёт: {winnerInfo.winnerScore}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-600 font-medium text-xl">
                  Нет победителя
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!room) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
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
                  Имя или игровой псевдоним
                </Label>
                <Input
                  id="participant-name"
                  name="participantName"
                  autoComplete="username"
                  placeholder="Имя или игровой псевдоним"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  required
                  aria-invalid={!!error}
                  className="h-14 text-lg text-center font-semibold"
                />
              </div>
              <p className="text-xs text-slate-500 text-center leading-relaxed mt-2">
                Не указывайте фамилию, телефон и другие лишние персональные данные.{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Политика обработки данных</a>
              </p>
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
  const isLocked = room.roundState === RoomState.REVEALED;

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
    if (buzzStatus === "pending") {
      statusText = "Отправляем сигнал…";
    } else if (buzzStatus === "accepted") {
      statusText = "Сигнал принят\nОжидаем результат";
    } else {
      statusText = "ЖМИТЕ!";
    }
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
      backgroundImage: `url(${resolveAssetUrl(room.customBgUrl)})`,
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
    <main id="main-content" tabIndex={-1} className={bgClass} style={bgStyle}>
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
                (resolveAssetUrl(room?.customLogoUrl) || "")
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
                buzzStatus !== "idle" && isActive && !shouldReduceMotion
                  ? { scale: 0.9 }
                  : { scale: 1 }
              }
              whileHover={
                !shouldReduceMotion &&
                ((isActive && buzzStatus === "idle") || (isLocked && amIFirst))
                  ? { scale: 1.05 }
                  : {}
              }
              whileTap={
                !shouldReduceMotion && isActive && buzzStatus === "idle"
                  ? { scale: 0.9, y: 10 }
                  : {}
              }
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onPointerDown={handleBuzz}
              onKeyDown={handleBuzz}
              disabled={!isActive || buzzStatus !== "idle"}
              aria-label="Игровой пульт (Buzzer)"
              aria-describedby="buzzer-status-text"
            >
              {isActive && buzzStatus === "idle" ? "ЖМИ!" : ""}
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
