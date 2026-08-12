import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameResult } from 'shared';
import { api } from '../../services/api';
import { HostHistory } from '../HostHistory';

const navigate = vi.hoisted(() => vi.fn());

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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../services/api', () => ({
  api: {
    getMe: vi.fn(),
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    logout: vi.fn(),
  },
}));

const game = {
  id: 'draw-game',
  roomCode: 'DRAW12',
  result: GameResult.DRAW,
  winnerName: null,
  winnerScore: 5,
  participants: 2,
  createdAt: '2026-08-12T09:00:00.000Z',
};

const user = {
  hasActiveSubscription: true,
  email: 'host@example.com',
  name: 'Host',
  avatarUrl: null,
  customLogoUrl: null,
  subscription: null,
};

const pageWithGame = {
  history: [game],
  count: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

function renderHistory() {
  return render(<MemoryRouter><HostHistory /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMe).mockResolvedValue(user);
  vi.mocked(api.getHistory).mockResolvedValue(pageWithGame);
  vi.mocked(api.clearHistory).mockResolvedValue({ success: true });
});

describe('HostHistory', () => {
  it('shows loading, then the date, time, room, participants, and result', async () => {
    renderHistory();

    expect(screen.getByRole('status')).toHaveTextContent('Загрузка истории');
    expect(await screen.findByText('DRAW12')).toBeInTheDocument();
    expect(screen.getByText('Ничья')).toBeInTheDocument();
    expect(screen.getByText('Участников: 2')).toBeInTheDocument();
    const time = screen.getByRole('time');
    expect(time).toHaveAttribute('datetime', game.createdAt);
    expect(time.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('renders a helpful empty state', async () => {
    vi.mocked(api.getHistory).mockResolvedValue({ history: [], count: 0, page: 1, pageSize: 10, totalPages: 0 });
    renderHistory();

    expect(await screen.findByText('История пока пуста')).toBeInTheDocument();
    expect(screen.getByText('Завершённые игры появятся здесь.')).toBeInTheDocument();
  });

  it('announces a load error and retries only history', async () => {
    vi.mocked(api.getHistory)
      .mockRejectedValueOnce(new Error('История временно недоступна'))
      .mockResolvedValueOnce({ history: [], count: 0, page: 1, pageSize: 10, totalPages: 0 });
    renderHistory();

    expect(await screen.findByRole('alert')).toHaveTextContent('История временно недоступна');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('История пока пуста')).toBeInTheDocument();
    expect(api.getMe).toHaveBeenCalledOnce();
    expect(api.getHistory).toHaveBeenCalledTimes(2);
  });

  it('loads the next and previous pages', async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce({ ...pageWithGame, count: 11, totalPages: 2 })
      .mockResolvedValueOnce({
        history: [{ ...game, id: 'winner-game', roomCode: 'WIN123', result: GameResult.WINNER, winnerName: 'Анна', winnerScore: 7 }],
        count: 11,
        page: 2,
        pageSize: 10,
        totalPages: 2,
      })
      .mockResolvedValueOnce({ ...pageWithGame, count: 11, totalPages: 2 });
    renderHistory();

    expect(await screen.findByText('Страница 1 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));

    expect(await screen.findByText('WIN123')).toBeInTheDocument();
    expect(screen.getByText('Страница 2 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

    await waitFor(() => expect(api.getHistory).toHaveBeenLastCalledWith(1, 10));
  });

  it('redirects an unauthenticated host before loading history', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new Error('Необходима авторизация'));
    renderHistory();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }));
    expect(api.getHistory).not.toHaveBeenCalled();
  });

  it('requires the exact confirmation before clearing all history', async () => {
    renderHistory();
    await screen.findByText('DRAW12');

    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    const dialog = screen.getByRole('dialog', { name: 'Очистить историю?' });
    const submit = within(dialog).getByRole('button', { name: 'Удалить всю историю' });
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Введите ОЧИСТИТЬ'), { target: { value: 'очистить' } });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Введите ОЧИСТИТЬ'), { target: { value: 'ОЧИСТИТЬ' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(await screen.findByText('История пока пуста')).toBeInTheDocument();
    expect(api.clearHistory).toHaveBeenCalledOnce();
  });

  it('keeps the clear dialog actionable after an API error', async () => {
    vi.mocked(api.clearHistory).mockRejectedValue(new Error('Не удалось очистить историю'));
    renderHistory();
    await screen.findByText('DRAW12');
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    const dialog = screen.getByRole('dialog', { name: 'Очистить историю?' });
    fireEvent.change(within(dialog).getByLabelText('Введите ОЧИСТИТЬ'), { target: { value: 'ОЧИСТИТЬ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Удалить всю историю' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось очистить историю');
    expect(within(dialog).getByRole('button', { name: 'Удалить всю историю' })).toBeEnabled();
  });
});
