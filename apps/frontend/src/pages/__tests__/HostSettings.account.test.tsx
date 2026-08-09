import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services/api';
import { socket } from '../../realtime/socket';
import { HostSettings } from '../HostSettings';

const navigate = vi.hoisted(() => vi.fn());
const password = 'password123';

vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => navigate,
}));
vi.mock('../../components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../../realtime/authRecovery', () => ({ useSocketAuthRecovery: vi.fn() }));
vi.mock('../../realtime/roomCreate', () => ({ emitRoomCreateWhenConnected: vi.fn() }));
vi.mock('../../realtime/socket', () => ({ socket: { disconnect: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => ({
  api: {
    getMe: vi.fn(),
    getSettings: vi.fn(),
    getSessions: vi.fn(),
    revokeSession: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    deleteAccount: vi.fn(),
    updateSettings: vi.fn(),
    clearHistory: vi.fn(),
    uploadLogo: vi.fn(),
    uploadBg: vi.fn(),
    deleteLogo: vi.fn(),
    deleteBg: vi.fn(),
  },
}));

type Session = {
  id: string;
  device: string;
  browser: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isCurrent: boolean;
};

type AccountApi = {
  getSessions: () => Promise<Session[]>;
  revokeSession: (sessionId: string) => Promise<{ success: boolean }>;
  logoutAll: () => Promise<{ success: boolean }>;
  deleteAccount: (payload: {
    currentPassword: string;
    confirmationPhrase: string;
    irreversibleConfirmed: boolean;
  }) => Promise<{ success: boolean }>;
};

const accountApi = api as typeof api & AccountApi;
const sessions: Session[] = [
  {
    id: 'current-session',
    device: 'iPhone',
    browser: 'Safari',
    ipAddress: '198.51.100.10',
    createdAt: '2026-08-05T08:00:00.000Z',
    lastSeenAt: '2026-08-05T09:00:00.000Z',
    isCurrent: true,
  },
  {
    id: 'legacy-session',
    device: 'Неизвестное устройство',
    browser: 'Неизвестный браузер',
    ipAddress: null,
    createdAt: '2026-08-04T08:00:00.000Z',
    lastSeenAt: null,
    isCurrent: false,
  },
];

function renderSettings() {
  return render(<HostSettings />);
}

beforeEach(() => {
  vi.clearAllMocks();
  navigate.mockReset();
  vi.mocked(api.getMe).mockResolvedValue({
    hasActiveSubscription: true,
    email: 'host@example.com',
    name: 'Host',
    avatarUrl: null,
    customLogoUrl: null,
    subscription: null,
  });
  vi.mocked(api.getSettings).mockResolvedValue({
    soundEnabled: true,
    soundTheme: 'classic',
    customLogoUrl: null,
    customBgUrl: null,
    bgTheme: 'light',
  });
  vi.mocked(accountApi.getSessions).mockResolvedValue(sessions);
  vi.mocked(accountApi.revokeSession).mockResolvedValue({ success: true });
  vi.mocked(accountApi.logoutAll).mockResolvedValue({ success: true });
  vi.mocked(accountApi.deleteAccount).mockResolvedValue({ success: true });
  vi.mocked(api.logout).mockResolvedValue(undefined);
  vi.mocked(api.updateSettings).mockResolvedValue({});
});

describe('HostSettings account security', () => {
  it('loads active sessions, marks the current one, and renders legacy unknown values', async () => {
    renderSettings();

    expect(await screen.findByRole('heading', { name: 'Активные сессии' })).toBeInTheDocument();
    expect(accountApi.getSessions).toHaveBeenCalledOnce();
    expect(screen.getByText('Текущая сессия')).toBeInTheDocument();
    expect(screen.getByText('iPhone · Safari')).toBeInTheDocument();
    expect(screen.getByText('Неизвестное устройство · Неизвестный браузер')).toBeInTheDocument();
    expect(screen.getByText('IP неизвестен')).toBeInTheDocument();
    expect(screen.getByText('Последняя активность неизвестна')).toBeInTheDocument();
  });

  it('revokes another session and removes only that row', async () => {
    renderSettings();
    const action = await screen.findByRole('button', { name: 'Завершить сессию Неизвестное устройство, Неизвестный браузер' });

    fireEvent.click(action);

    await waitFor(() => expect(accountApi.revokeSession).toHaveBeenCalledWith('legacy-session'));
    expect(screen.queryByText('Неизвестное устройство · Неизвестный браузер')).not.toBeInTheDocument();
    expect(screen.getByText('iPhone · Safari')).toBeInTheDocument();
  });

  it('shows session API errors and allows retry', async () => {
    vi.mocked(accountApi.getSessions)
      .mockRejectedValueOnce(new Error('Сессии временно недоступны'))
      .mockResolvedValueOnce(sessions);
    renderSettings();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сессии временно недоступны');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку сессий' }));

    expect(await screen.findByText('iPhone · Safari')).toBeInTheDocument();
    expect(accountApi.getSessions).toHaveBeenCalledTimes(2);
  });

  it('confirms logout-all, clears the socket, and redirects to login', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти на всех устройствах' }));
    const dialog = screen.getByRole('dialog', { name: 'Выйти на всех устройствах?' });
    expect(accountApi.logoutAll).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить выход' }));

    await waitFor(() => expect(accountApi.logoutAll).toHaveBeenCalledOnce());
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('requires all deletion confirmations and clears auth state after success', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить аккаунт навсегда?' });
    const submit = within(dialog).getByRole('button', { name: 'Удалить аккаунт навсегда' });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Текущий пароль'), { target: { value: password } });
    fireEvent.change(within(dialog).getByLabelText('Фраза подтверждения'), { target: { value: 'УДАЛИТЬ АККАУНТ' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Я понимаю, что аккаунт и данные нельзя восстановить' }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(accountApi.deleteAccount).toHaveBeenCalledWith({
      currentPassword: password,
      confirmationPhrase: 'УДАЛИТЬ АККАУНТ',
      irreversibleConfirmed: true,
    }));
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('keeps dialogs actionable after API errors and performs ordinary logout server-first', async () => {
    vi.mocked(accountApi.logoutAll).mockRejectedValueOnce(new Error('Не удалось выйти'));
    const order: string[] = [];
    vi.mocked(api.logout).mockImplementation(async () => { order.push('api'); });
    vi.mocked(socket.disconnect).mockImplementation(() => { order.push('socket'); return socket; });
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Выйти на всех устройствах' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить выход' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выйти');
    expect(screen.getByRole('button', { name: 'Подтвердить выход' })).toBeEnabled();
    expect(socket.disconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти из текущей сессии' }));
    await waitFor(() => expect(api.logout).toHaveBeenCalledOnce());
    expect(order).toEqual(['api', 'socket']);
  });
});
