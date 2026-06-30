import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../realtime/socket';

export function ParticipantJoin() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('ROOM_JOIN', { roomCode: code.toUpperCase(), displayName: name }, (res: any) => {
      if (res.success) {
        navigate(`/room/${code.toUpperCase()}`);
      } else {
        setError(res.error || 'Ошибка подключения');
      }
    });
  };

  return (
    <div className="container flex-col flex-center" style={{ minHeight: '100vh', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Вход в игру</h2>
        
        {error && <p style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
        
        <form onSubmit={handleJoin} className="flex-col" style={{ display: 'flex' }}>
          <input
            className="input-field"
            type="text"
            placeholder="Код комнаты"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            required
            maxLength={6}
          />
          <input
            className="input-field"
            type="text"
            placeholder="Ваше имя"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            maxLength={20}
          />
          <button className="btn btn-primary" type="submit" style={{ marginTop: '1rem', fontSize: '1.2rem', padding: '1rem' }}>
            Подключиться
          </button>
        </form>
      </div>
    </div>
  );
}
