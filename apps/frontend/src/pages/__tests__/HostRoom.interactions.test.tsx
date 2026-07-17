import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HostRoom } from '../HostRoom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { socket } from '../../realtime/socket';
import { RoomState } from 'shared';

vi.mock('../../realtime/socket', () => {
  const mSocket = {
    connected: false,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { socket: mSocket };
});

vi.mock('../../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({
      soundEnabled: true,
      soundTheme: 'classic',
    }),
  },
  BASE_URL: 'http://localhost:3000/api',
}));

describe('HostRoom interactions & pending states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.connected = false;
    // @ts-ignore
    socket.connect.mockImplementation(() => {
      socket.connected = true;
      setTimeout(() => {
        // @ts-ignore
        const connectCalls = socket.on.mock.calls.filter((call: any) => call[0] === 'connect');
        connectCalls.forEach((call: any) => call[1]());
      }, 0);
    });
  });

  const mockRoomData = (state: RoomState) => ({
    roomId: 'room-123',
    roomCode: 'ABCDEF',
    hostUserId: 'host-1',
    hostSocketId: 'sock-1',
    participants: [{ id: 'p1', displayName: 'Player 1', score: 0 }],
    roundState: state,
    firstBuzzerId: state === RoomState.REVEALED ? 'p1' : null,
    createdAt: Date.now(),
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={[`/host/room/room-123`]}>
        <Routes>
          <Route path="/host/room/:roomId" element={<HostRoom />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. Start round button shows pending state and disables during callback', async () => {
    let hostRejoinCallback: any;
    let roundStartCallback: any;

    socket.emit = vi.fn().mockImplementation((event, ...args) => {
      const cb = args.find(a => typeof a === 'function');
      if (event === 'HOST_REJOIN_ROOM') hostRejoinCallback = cb;
      if (event === 'ROUND_START') roundStartCallback = cb;
    });

    renderComponent();

    // Wait for the simulated socket connect event to fire emit
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    // Trigger rejoin
    await act(async () => {
      hostRejoinCallback({ success: true, room: mockRoomData(RoomState.WAITING) });
    });

    const startBtn = await screen.findByRole('button', { name: /СТАРТ РАУНДА/i });
    expect(startBtn).not.toBeDisabled();

    // Click start
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Should now be disabled and show 'ЗАПУСК...'
    expect(startBtn).toBeDisabled();
    expect(startBtn).toHaveTextContent(/ЗАПУСК\.\.\./i);
    
    // Resolve callback
    await act(async () => {
      roundStartCallback({ success: true });
    });

    // After callback, state resets to normal text (even though state might change from server later)
    expect(startBtn).toHaveTextContent(/СТАРТ РАУНДА/i);
  });

  it('2. Reveal buttons disable and show error if callback fails', async () => {
    let hostRejoinCallback: any;
    let roundResetCallback: any;

    socket.emit = vi.fn().mockImplementation((event, ...args) => {
      const cb = args.find(a => typeof a === 'function');
      if (event === 'HOST_REJOIN_ROOM') hostRejoinCallback = cb;
      if (event === 'ROUND_RESET') roundResetCallback = cb;
    });

    renderComponent();

    // Wait for the simulated socket connect event to fire emit
    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    await act(async () => {
      hostRejoinCallback({ success: true, room: mockRoomData(RoomState.REVEALED) });
    });

    // Need to set name manually for first buzzer
    await act(async () => {
      // @ts-ignore
      const stateUpdateCalls = socket.on.mock.calls.filter((call: any) => call[0] === 'ROOM_STATE_UPDATED');
      stateUpdateCalls.forEach((call: any) => call[1]({
        ...mockRoomData(RoomState.REVEALED),
        participants: [{ id: 'p1', displayName: 'Player 1', score: 0 }],
      }));
    });

    const correctBtn = await screen.findByRole('button', { name: /Верно/i });
    expect(correctBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(correctBtn);
    });

    expect(correctBtn).toBeDisabled();
    expect(correctBtn).toHaveTextContent(/Ожидание\.\.\./i);

    // Fail the callback
    await act(async () => {
      roundResetCallback({ success: false, error: 'Ошибка обновления' });
    });

    // Button should be re-enabled
    expect(correctBtn).not.toBeDisabled();
    expect(correctBtn).toHaveTextContent(/Верно/i);

    // Error message should be visible
    expect(await screen.findByText('Ошибка обновления')).toBeInTheDocument();
  });
});
