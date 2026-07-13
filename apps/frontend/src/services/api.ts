const ENV_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`)
  : (import.meta.env.VITE_APP_PUBLIC_URL || '/api');

export const BASE_URL = ENV_URL;
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
  if (errorMsg === 'Failed to activate') return 'Ошибка активации. Пожалуйста, попробуйте позже.';
  return errorMsg;
};

// All requests include credentials so httpOnly cookies are sent automatically
const customFetch = async (url: string, options?: RequestInit) => {
  try {
    return await fetch(url, { credentials: 'include', ...options });
  } catch (error: any) {
    throw new Error(translateError(error.message || 'Failed to fetch'));
  }
};

export const api = {
  async login(email: string, password: string) {
    const res = await customFetch(`${API_URL}/auth/login`, {
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
    const res = await customFetch(`${API_URL}/auth/register`, {
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

  async logout() {
    // Clears the httpOnly cookie server-side
    await customFetch(`${API_URL}/auth/logout`, { method: 'POST' });
  },

  async clearSession() {
    await customFetch(`${API_URL}/auth/clear-session`, { method: 'POST' });
  },

  async getMe() {
    const res = await customFetch(`${API_URL}/auth/me`);
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

  async updateProfile(data: { name?: string, email?: string }) {
    const res = await customFetch(`${API_URL}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errorMsg = 'Failed to update profile';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await customFetch(`${API_URL}/auth/avatar`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      let errorMsg = 'Failed to upload avatar';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async uploadLogo(file: File) {
    const formData = new FormData();
    formData.append('logo', file);

    const res = await customFetch(`${API_URL}/settings/upload-logo`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      let errorMsg = 'Failed to upload logo';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async uploadBg(file: File) {
    const formData = new FormData();
    formData.append('background', file);

    const res = await customFetch(`${API_URL}/settings/upload-bg`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      let errorMsg = 'Failed to upload background';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async getSettings() {
    const res = await customFetch(`${API_URL}/settings`);
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

  async updateSettings(data: any) {
    const res = await customFetch(`${API_URL}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  async getHistory() {
    const res = await customFetch(`${API_URL}/history`);
    if (!res.ok) {
      throw new Error('Failed to fetch history');
    }
    return res.json();
  },

  async clearHistory() {
    const res = await customFetch(`${API_URL}/history`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('Failed to clear history');
    }
    return res.json();
  },

  async activateFreeTrial() {
    const res = await customFetch(`${API_URL}/billing/activate-free`, {
      method: 'POST',
    });
    if (!res.ok) {
      let errorMsg = 'Failed to activate';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  }
};
