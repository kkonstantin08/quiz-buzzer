import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameResult } from 'shared';
import { api } from '../../services/api';
import { HostDashboard } from '../HostDashboard';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => navigate,
}));
vi.mock('../../realtime/authRecovery', () => ({ useSocketAuthRecovery: vi.fn() }));
vi.mock('../../realtime/roomCreate', () => ({ emitRoomCreateWhenConnected: vi.fn() }));
vi.mock('../../realtime/socket', () => ({ socket: { disconnect: vi.fn() } }));
vi.mock('../../components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('../../services/api', () => ({
  api: {
    getMe: vi.fn(),
    getHistory: vi.fn(),
    logout: vi.fn(),
  },
}));

const history = [
  {
    id: 'winner',
    roomCode: 'WIN123',
    result: GameResult.WINNER,
    winnerName: 'Анна',
    winnerScore: 7,
    participants: 4,
    createdAt: '2026-08-12T09:00:00.000Z',
  },
  {
    id: 'draw',
    roomCode: 'DRAW12',
    result: GameResult.DRAW,
    winnerName: null,
    winnerScore: 5,
    participants: 2,
    createdAt: '2026-08-11T09:00:00.000Z',
  },
  {
    id: 'none',
    roomCode: 'NONE12',
    result: GameResult.NO_WINNER,
    winnerName: null,
    winnerScore: 0,
    participants: 3,
    createdAt: '2026-08-10T09:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMe).mockResolvedValue({
    hasActiveSubscription: true,
    email: 'host@example.com',
    name: 'Host',
    avatarUrl: null,
    customLogoUrl: null,
    subscription: null,
  });
  vi.mocked(api.getHistory).mockResolvedValue({
    history,
    count: 12,
    page: 1,
    pageSize: 5,
    totalPages: 3,
  });
});

describe('HostDashboard recent history', () => {
  it('requests a compact page and renders every result type honestly', async () => {
    render(<MemoryRouter><HostDashboard /></MemoryRouter>);

    expect(await screen.findByText('Анна')).toBeInTheDocument();
    expect(screen.getByText('7 баллов')).toBeInTheDocument();
    expect(screen.getByText('Ничья')).toBeInTheDocument();
    expect(screen.getByText('Без победителя')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Победитель')).toHaveLength(1);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вся история' })).toHaveAttribute('href', '/history');
    await waitFor(() => expect(api.getHistory).toHaveBeenCalledWith(1, 5));
  });
});
