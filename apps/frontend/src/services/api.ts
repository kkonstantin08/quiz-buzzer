// Use VITE_SERVER_URL for base host, fallback to VITE_API_URL for backwards compatibility
const isDev = import.meta.env.DEV;
const BASE_URL = isDev ? `http://${window.location.hostname}:3001` : (import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001');
// Strip trailing slash if any
const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
// If the URL already ends with /api, use it as is, otherwise append /api
const API_URL = cleanBaseUrl.endsWith('/api') ? cleanBaseUrl : `${cleanBaseUrl}/api`;

const translateError = (errorMsg: string) => {
  if (errorMsg === 'Internal server error') return 'Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.';
  if (errorMsg === 'Unauthorized') return 'Необходима авторизация';
  if (errorMsg === 'No token provided') return 'Токен не предоставлен';
  if (errorMsg === 'Invalid token') return 'Недействительный токен';
  if (errorMsg === 'Login failed') return 'Ошибка входа';
  if (errorMsg === 'Registration failed') return 'Ошибка регистрации';
  if (errorMsg === 'Invalid credentials') return 'Неверный email или пароль';
  if (errorMsg === 'Email already in use') return 'Этот email уже зарегистрирован';
  if (errorMsg === 'Failed to fetch') return 'Сервер недоступен. Пожалуйста, проверьте подключение к интернету или попробуйте позже.';
  return errorMsg;
};

export const api = {
  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      let errorMsg = 'Login failed';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async register(email: string, password: string) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      let errorMsg = 'Registration failed';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async getMe(token: string) {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      let errorMsg = 'Unauthorized';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async getSettings(token: string) {
    const res = await fetch(`${API_URL}/settings`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      let errorMsg = 'Failed to fetch settings';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async updateSettings(token: string, data: any) {
    const res = await fetch(`${API_URL}/settings`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errorMsg = 'Failed to update settings';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async getHistory(token: string) {
    const res = await fetch(`${API_URL}/history`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('Failed to fetch history');
    }
    return res.json();
  },
};
