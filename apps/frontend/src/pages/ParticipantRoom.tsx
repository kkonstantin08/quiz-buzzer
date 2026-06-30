import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../realtime/socket';
import { RoomData, RoomState } from 'shared';

export function ParticipantRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);

  useEffect(() => {
    if (!socket.connected) {
      // If we land here but socket is not connected (e.g. reload)
      // For MVP, just redirect to join page.
      navigate('/');
      return;
    }

    const onStateUpdate = (updatedRoom: RoomData) => {
      setRoom(updatedRoom);
    };

    socket.on('ROOM_STATE_UPDATED', onStateUpdate);
    
    // We also listen to explicit lock events for immediate UI feedback
    socket.on('ROUND_LOCKED', () => {
      setRoom(prev => prev ? { ...prev, roundState: RoomState.BUZZED_HIDDEN } : null);
    });

    return () => {
      socket.off('ROOM_STATE_UPDATED', onStateUpdate);
      socket.off('ROUND_LOCKED');
    };
  }, [navigate]);

  const handleBuzz = () => {
    if (room?.roundState !== RoomState.ACTIVE) return;
    
    // Optimistic UI lock
    setRoom(prev => prev ? { ...prev, roundState: RoomState.BUZZED_HIDDEN } : null);
    
    socket.emit('BUZZ_SUBMIT', (res: any) => {
      if (!res.success && res.error === 'Too late') {
        // Someone else was faster, but we are already locked visually, which is correct
      }
    });
  };

  if (!room) {
    return <div className="container flex-center" style={{ minHeight: '100vh' }}>Загрузка...</div>;
  }

  const isWaiting = room.roundState === RoomState.WAITING || room.roundState === RoomState.REVEALED;
  const isActive = room.roundState === RoomState.ACTIVE;
  const isLocked = room.roundState === RoomState.BUZZED_HIDDEN;

  let btnClass = 'buzzer-waiting';
  let btnText = '';
  let statusText = '';

  if (isWaiting) {
    btnClass = 'buzzer-waiting';
    statusText = 'Ожидайте старта';
  } else if (isActive) {
    btnClass = 'buzzer-active';
    statusText = 'ЖМИТЕ!';
  } else if (isLocked) {
    btnClass = 'buzzer-locked';
    statusText = 'Кнопка заблокирована\nОжидайте следующий раунд';
  }

  return (
    <div className="buzzer-container">
      <div style={{ position: 'absolute', top: '1rem', left: '1rem', color: 'var(--border-color)', fontWeight: 'bold' }}>
        {room.roomCode}
      </div>
      <button 
        className={`buzzer-btn ${btnClass}`} 
        onClick={handleBuzz}
        disabled={!isActive}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {isActive ? 'BUZZ' : ''}
      </button>
      <div className="status-text" style={{ whiteSpace: 'pre-line' }}>
        {statusText}
      </div>
    </div>
  );
}
