import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { HostRoom } from '../HostRoom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { socket } from '../../realtime/socket';

// Mock the socket module
vi.mock('../../realtime/socket', () => {
  const mSocket = {
    connected: false,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
  return {
    socket: mSocket,
  };
});

// Mock api settings
vi.mock('../../services/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({
      soundEnabled: true,
      soundTheme: 'classic',
    }),
  },
  BASE_URL: 'http://localhost:3000/api',
}));

describe('HostRoom Frontend Reconnect & States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (roomId: string) => {
    return render(
      <MemoryRouter initialEntries={[`/host/room/${roomId}`]}>
        <Routes>
          <Route path="/host/room/:roomId" element={<HostRoom />} />
          <Route path="/dashboard" element={<div>Dashboard Screen</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. Displays loading screen during restoration state', async () => {
    // Keep rejoin promise pending so we stay in loading state
    socket.emit = vi.fn();

    renderComponent('room-123');

    expect(screen.getByText(/Восстанавливаем игру…/i)).toBeInTheDocument();
  });

  it('3. Successful restoration renders host controls', async () => {
    // Mock successful HOST_REJOIN_ROOM emit
    const mockRoomData = {
      roomId: 'room-123',
      roomCode: 'ABCDEF',
      hostUserId: 'host-1',
      hostSocketId: 'sock-1',
      participants: [],
      roundState: 'WAITING',
      firstBuzzerId: null,
      createdAt: Date.now(),
    };

    socket.emit = vi.fn().mockImplementation((event, data, callback) => {
      if (event === 'HOST_REJOIN_ROOM') {
        callback({ success: true, room: mockRoomData });
      }
    });

    renderComponent('room-123');

    // Restoration completes and we see "Игра активна"
    expect(await screen.findByText(/Игра активна/i)).toBeInTheDocument();
  });

  it('4. Rejoin failure shows unavailable screen', async () => {
    // Mock failed HOST_REJOIN_ROOM emit
    socket.emit = vi.fn().mockImplementation((event, data, callback) => {
      if (event === 'HOST_REJOIN_ROOM') {
        callback({ success: false, error: 'Комната недоступна' });
      }
    });

    renderComponent('room-123');

    expect((await screen.findAllByText(/Игра недоступна/i)).length).toBeGreaterThan(0);
  });

  it('5. HOST_CONTROL_REVOKED shows control revoked screen', async () => {
    // Start with a successful rejoin
    const mockRoomData = {
      roomId: 'room-123',
      roomCode: 'ABCDEF',
      hostUserId: 'host-1',
      hostSocketId: 'sock-1',
      participants: [],
      roundState: 'WAITING',
      firstBuzzerId: null,
      createdAt: Date.now(),
    };

    let revokeCallback: (() => void) | undefined;
    socket.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'HOST_CONTROL_REVOKED') {
        revokeCallback = cb;
      }
    });

    socket.emit = vi.fn().mockImplementation((event, data, callback) => {
      if (event === 'HOST_REJOIN_ROOM') {
        callback({ success: true, room: mockRoomData });
      }
    });

    renderComponent('room-123');

    // Wait until connected
    expect(await screen.findByText(/Игра активна/i)).toBeInTheDocument();

    // Simulate event HOST_CONTROL_REVOKED from server
    act(() => {
      if (revokeCallback) revokeCallback();
    });

    expect(screen.getByText(/Управление отозвано/i)).toBeInTheDocument();
    expect(screen.getByText(/Управление игрой перенесено в другую вкладку/i)).toBeInTheDocument();
  });

  it('6. Socket reconnect triggers rejoin again', async () => {
    let connectCallback: (() => void) | undefined;
    socket.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'connect') {
        connectCallback = cb;
      }
    });

    let rejoinCount = 0;
    socket.emit = vi.fn().mockImplementation((event, data, callback) => {
      if (event === 'HOST_REJOIN_ROOM') {
        rejoinCount++;
        callback({
          success: true,
          room: {
            roomId: 'room-123',
            roomCode: 'ABCDEF',
            hostUserId: 'host-1',
            hostSocketId: 'sock-1',
            participants: [],
            roundState: 'WAITING',
            firstBuzzerId: null,
            createdAt: Date.now(),
          },
        });
      }
    });

    renderComponent('room-123');

    expect(await screen.findByText(/Игра активна/i)).toBeInTheDocument();
    expect(rejoinCount).toBe(1);

    // Simulate socket reconnect
    act(() => {
      if (connectCallback) connectCallback();
    });

    expect(rejoinCount).toBe(2);
  });
});
