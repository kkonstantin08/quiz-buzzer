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
  if (errorMsg === 'Unable to update email') return 'Не удалось изменить email. Проверьте текущий пароль.';
  if (errorMsg === 'Invalid password change') return 'Не удалось изменить пароль';
  if (errorMsg === 'Too many password attempts, please try again after 15 minutes') return 'Слишком много попыток. Попробуйте позже.';
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

const deleteImage = async (path: string, fallbackError: string) => {
  const res = await customFetch(`${API_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    let errorMsg = fallbackError;
    try {
      const error = await res.json();
      errorMsg = error.error || errorMsg;
    } catch (e) {}
    throw new Error(translateError(errorMsg));
  }
  return res.json();
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

  async register(email: string, password: string, legalContext?: { termsAccepted: boolean; displayedTermsVersion: string; personalDataConsentAccepted: boolean; displayedPersonalDataConsentVersion: string }) {
    const res = await customFetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...legalContext }),
    });
    if (!res.ok) {
      try {
        const errObj = await res.json();
        // Priority: code-specific handling first, then specific message, then generic error string
        if (errObj.code) {
           // We can attach the code to the error object so the UI can check it
           const err: any = new Error(errObj.message || errObj.error || 'Registration failed');
           err.code = errObj.code;
           err.documentType = errObj.documentType;
           throw err;
        }
        const errorMsg = errObj.error || errObj.message || 'Registration failed';
        throw new Error(translateError(errorMsg));
      } catch (e) {
        if (e instanceof Error && (e as any).code) throw e;
        throw new Error(translateError(e instanceof Error ? e.message : 'Registration failed'));
      }
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

  async updateProfile(data: { name?: string, email?: string, currentPassword?: string }) {
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

  async changePassword(data: { currentPassword: string, newPassword: string }) {
    const res = await customFetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errorMsg = 'Failed to change password';
      try {
        const error = await res.json();
        errorMsg = error.error || errorMsg;
      } catch {}
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

  async deleteAvatar() {
    return deleteImage('/auth/avatar', 'Failed to delete avatar');
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

  async deleteLogo() {
    return deleteImage('/settings/logo', 'Failed to delete logo');
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

  async deleteBg() {
    return deleteImage('/settings/background', 'Failed to delete background');
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

  async updateSettings(data: { soundEnabled?: boolean; soundTheme?: string; bgTheme?: string }) {
    const { soundEnabled, soundTheme, bgTheme } = data;
    const res = await customFetch(`${API_URL}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundEnabled, soundTheme, bgTheme }),
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

  async getBillingStatus() {
    try {
      const res = await customFetch(`${API_URL}/billing/status`);
      if (!res.ok) return { paymentsEnabled: false, providerConfigured: false, checkoutAvailable: false };
      return res.json();
    } catch (e) {
      return { paymentsEnabled: false, providerConfigured: false, checkoutAvailable: false };
    }
  },

  async checkout() {
    const res = await customFetch(`${API_URL}/billing/checkout`, { method: 'POST' });
    if (!res.ok) {
      let errorMsg = 'Checkout failed';
      try {
        const error = await res.json();
        errorMsg = error.message || error.error || errorMsg;
      } catch (e) {}
      throw new Error(translateError(errorMsg));
    }
    return res.json();
  },

  async activateFreeTrial() {
    const res = await customFetch(`${API_URL}/billing/activate-free`, { method: 'POST' });
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
