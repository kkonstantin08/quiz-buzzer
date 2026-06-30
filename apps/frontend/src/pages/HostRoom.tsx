import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../realtime/socket';
import { RoomData, RoomState, Participant } from 'shared';

export function HostRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [firstBuzzerName, setFirstBuzzerName] = useState<string>('');

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const onStateUpdate = (updatedRoom: RoomData) => {
      setRoom(updatedRoom);
      if (updatedRoom.roundState === RoomState.REVEALED && updatedRoom.firstBuzzerId) {
        const p = updatedRoom.participants.find(p => p.id === updatedRoom.firstBuzzerId);
        setFirstBuzzerName(p ? p.displayName : 'Неизвестный участник');
      }
    };

    socket.on('ROOM_STATE_UPDATED', onStateUpdate);
    socket.on('PARTICIPANT_JOINED', () => {});
    socket.on('PARTICIPANT_LEFT', () => {});
    socket.on('BUZZ_RECORDED_HIDDEN', () => {});
    socket.on('FIRST_REVEALED', (id) => {
      const p = room?.participants.find(p => p.id === id);
      if (p) setFirstBuzzerName(p.displayName);
    });
    socket.on('ROUND_RESET_DONE', () => {
      setFirstBuzzerName('');
    });

    return () => {
      socket.off('ROOM_STATE_UPDATED', onStateUpdate);
      socket.off('PARTICIPANT_JOINED');
      socket.off('PARTICIPANT_LEFT');
      socket.off('BUZZ_RECORDED_HIDDEN');
      socket.off('FIRST_REVEALED');
      socket.off('ROUND_RESET_DONE');
    };
  }, [room]);

  if (!room) {
    return <div className="container">Загрузка комнаты...</div>;
  }

  const publicUrl = import.meta.env.VITE_APP_PUBLIC_URL || window.location.origin;
  const joinUrl = `${publicUrl}/room/${room.roomCode}`;

  const handleStartRound = () => socket.emit('ROUND_START');
  const handleReveal = () => socket.emit('FIRST_REVEAL');
  const handleReset = () => socket.emit('ROUND_RESET');

  return (
    <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
      
      {/* Left Column: QR and Code */}
      <div className="card flex-col flex-center">
        <h2>Код комнаты: <span style={{ color: 'var(--primary)', letterSpacing: '0.1em' }}>{room.roomCode}</span></h2>
        
        <div style={{ background: 'white', padding: '1rem', borderRadius: '1rem', margin: '2rem 0' }}>
          <QRCodeSVG value={joinUrl} size={250} />
        </div>
        
        <p style={{ opacity: 0.8, marginBottom: '1rem' }}>Ссылка для подключения:</p>
        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <input className="input-field" value={joinUrl} readOnly style={{ margin: 0 }} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(joinUrl)} style={{ background: 'var(--border-color)', color: 'white' }}>Копировать</button>
        </div>
      </div>

      {/* Right Column: Controls and Participants */}
      <div className="flex-col" style={{ gap: '2rem', display: 'flex' }}>
        <div className="card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          {room.roundState === RoomState.WAITING && (
            <>
              <h2 style={{ color: 'var(--text-color)', opacity: 0.8 }}>Ожидание запуска раунда</h2>
              <button className="btn btn-primary" style={{ fontSize: '1.25rem', padding: '1rem 2rem', marginTop: '1rem' }} onClick={handleStartRound}>
                Start Round
              </button>
            </>
          )}

          {room.roundState === RoomState.ACTIVE && (
            <>
              <h2 style={{ color: 'var(--success)' }}>Раунд активен</h2>
              <p style={{ opacity: 0.8, marginTop: '1rem' }}>Ожидание нажатия...</p>
            </>
          )}

          {room.roundState === RoomState.BUZZED_HIDDEN && (
            <>
              <h2 style={{ color: 'var(--warning)' }}>Нажатие зафиксировано</h2>
              <button className="btn" style={{ background: 'var(--warning)', color: 'white', fontSize: '1.25rem', padding: '1rem 2rem', marginTop: '1rem' }} onClick={handleReveal}>
                Показать первого
              </button>
            </>
          )}

          {room.roundState === RoomState.REVEALED && (
            <>
              <h2 style={{ color: 'var(--primary)' }}>Первым нажал: {firstBuzzerName}</h2>
              <button className="btn" style={{ background: 'var(--border-color)', color: 'white', fontSize: '1.25rem', padding: '1rem 2rem', marginTop: '2rem' }} onClick={handleReset}>
                Следующий раунд
              </button>
            </>
          )}

        </div>

        <div className="card">
          <h3>Участники ({room.participants.length}/8)</h3>
          <ul style={{ listStyle: 'none', marginTop: '1rem' }}>
            {room.participants.length === 0 ? (
              <li style={{ opacity: 0.5 }}>Пока никого нет</li>
            ) : (
              room.participants.map((p, i) => (
                <li key={p.id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1rem', fontWeight: 'bold' }}>
                    {i + 1}
                  </div>
                  {p.displayName}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
