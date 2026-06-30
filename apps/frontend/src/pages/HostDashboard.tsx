import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { socket } from '../realtime/socket';
import { RoomData } from 'shared';

export function HostDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('hostToken') || '');
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      checkAuth(token);
    }
  }, [token]);

  const checkAuth = async (t: string) => {
    try {
      const data = await api.getMe(t);
      setHasSubscription(data.hasActiveSubscription);
    } catch (err) {
      localStorage.removeItem('hostToken');
      setToken('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = isLogin 
        ? await api.login(email, password)
        : await api.register(email, password);
      
      localStorage.setItem('hostToken', data.token);
      setToken(data.token);
      setHasSubscription(data.hasActiveSubscription);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = () => {
    if (!socket.connected) {
      socket.connect();
    }
    
    socket.emit('ROOM_CREATE', token, (res: { success: boolean, room?: RoomData, error?: string }) => {
      if (res.success && res.room) {
        navigate(`/host/room/${res.room.roomId}`);
      } else {
        alert(res.error || 'Failed to create room');
      }
    });
  };

  if (token) {
    return (
      <div className="container flex-col flex-center" style={{ minHeight: '100vh' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <h2>Панель управления (Host)</h2>
          
          {hasSubscription ? (
            <div style={{ marginTop: '2rem' }}>
              <p style={{ color: 'var(--success)', marginBottom: '1rem', fontWeight: 500 }}>Подписка активна</p>
              <button className="btn btn-primary" onClick={handleCreateRoom} style={{ width: '100%' }}>
                Создать комнату
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '2rem' }}>
              <p style={{ color: 'var(--danger)', marginBottom: '1rem', fontWeight: 500 }}>
                Для создания комнаты нужна активная подписка
              </p>
            </div>
          )}
          
          <button 
            className="btn" 
            style={{ marginTop: '2rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}
            onClick={() => {
              localStorage.removeItem('hostToken');
              setToken('');
            }}
          >
            Выйти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container flex-col flex-center" style={{ minHeight: '100vh' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
        <h2 style={{ textAlign: 'center' }}>{isLogin ? 'Вход (Host)' : 'Регистрация (Host)'}</h2>
        {error && <p style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <input
            className="input-field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="input-field"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1rem', cursor: 'pointer', opacity: 0.8 }} onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </p>
      </div>
    </div>
  );
}
