import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HostRoom } from '../HostRoom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { socket } from '../../realtime/socket';
import { RoomState } from 'shared';

const mockPlaySound = vi.fn();
vi.mock('../../lib/sounds', () => ({
  playSound: (...args: any[]) => mockPlaySound(...args)
}));

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
  let hostRejoinCallback: any;
  let eventCallbackMap: Record<string, any> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    eventCallbackMap = {};
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

    socket.emit = vi.fn().mockImplementation((event, ...args) => {
      const cb = args.find(a => typeof a === 'function');
      if (event === 'HOST_REJOIN_ROOM') hostRejoinCallback = cb;
      eventCallbackMap[event] = cb;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  const renderComponent = async (state: RoomState = RoomState.WAITING) => {
    render(
      <MemoryRouter initialEntries={[`/host/room/room-123`]}>
        <Routes>
          <Route path="/host/room/:roomId" element={<HostRoom />} />
        </Routes>
      </MemoryRouter>
    );
    
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    await act(async () => {
      hostRejoinCallback({ success: true, room: mockRoomData(state) });
    });
    
    if (state === RoomState.REVEALED) {
      await act(async () => {
        // @ts-ignore
        const stateUpdateCalls = socket.on.mock.calls.filter((call: any) => call[0] === 'ROOM_STATE_UPDATED');
        stateUpdateCalls.forEach((call: any) => call[1]({
          ...mockRoomData(RoomState.REVEALED),
          participants: [{ id: 'p1', displayName: 'Player 1', score: 0 }],
        }));
      });
    }
  };

  it('1. ROUND_START logic', async () => {
    await renderComponent();
    const btn = screen.getByRole('button', { name: /СТАРТ РАУНДА/i });
    
    // Click
    await act(async () => {
      fireEvent.click(btn);
    });
    
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/ЗАПУСК\.\.\./i);
    
    // Duplicate click during pending should not fire again
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(socket.emit).toHaveBeenCalledTimes(2); // REJOIN + 1 ROUND_START
    
    // Success callback
    await act(async () => {
      eventCallbackMap['ROUND_START']({ success: true });
    });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent(/СТАРТ РАУНДА/i);
    
    // Error callback
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toBeDisabled();
    await act(async () => {
      eventCallbackMap['ROUND_START']({ success: false, error: 'Cannot start' });
    });
    expect(btn).not.toBeDisabled();
    expect(screen.getByText('Cannot start')).toBeInTheDocument();
    
    // Timeout
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(btn).not.toBeDisabled();
    expect(screen.getByText('Превышено время ожидания ответа от сервера. Проверьте соединение.')).toBeInTheDocument();
    
    // Late callback should be ignored
    await act(async () => {
      eventCallbackMap['ROUND_START']({ success: false, error: 'Late error' });
    });
    expect(screen.queryByText('Late error')).not.toBeInTheDocument();
  });

  it('2. ROUND_RESET (Correct and Wrong)', async () => {
    await renderComponent(RoomState.REVEALED);
    const correctBtn = screen.getByRole('button', { name: /Верно/i });
    const wrongBtn = screen.getByRole('button', { name: /Мимо/i });
    
    // Success correct
    await act(async () => { fireEvent.click(correctBtn); });
    await act(async () => { eventCallbackMap['ROUND_RESET']({ success: true }); });
    expect(mockPlaySound).toHaveBeenCalledWith('correct', 'classic', true);
    
    mockPlaySound.mockClear();
    
    // Success wrong
    await act(async () => { fireEvent.click(wrongBtn); });
    await act(async () => { eventCallbackMap['ROUND_RESET']({ success: true }); });
    expect(mockPlaySound).toHaveBeenCalledWith('wrong', 'classic', true);
    
    mockPlaySound.mockClear();
    
    // Error
    await act(async () => { fireEvent.click(correctBtn); });
    await act(async () => { eventCallbackMap['ROUND_RESET']({ success: false, error: 'Err' }); });
    expect(mockPlaySound).not.toHaveBeenCalled();
    
    // Timeout
    await act(async () => { fireEvent.click(correctBtn); });
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mockPlaySound).not.toHaveBeenCalled();
    
    // Late callback
    await act(async () => { eventCallbackMap['ROUND_RESET']({ success: true }); });
    expect(mockPlaySound).not.toHaveBeenCalled();
  });

  it('3. HOST_CLEAR_SCORES logic', async () => {
    await renderComponent();
    
    // We need to click "Очистить счёт"
    const clearBtn = screen.getByRole('button', { name: /Очистить счёт/i });
    
    // Click triggers emit immediately
    await act(async () => { fireEvent.click(clearBtn); });
    expect(clearBtn).toBeDisabled();
    expect(clearBtn).toHaveTextContent(/Очистка/i);
    
    await act(async () => { eventCallbackMap['HOST_CLEAR_SCORES']({ success: true }); });
    expect(clearBtn).not.toBeDisabled();
    expect(clearBtn).toHaveTextContent(/Очистить счёт/i);
    
    // Timeout
    await act(async () => { fireEvent.click(clearBtn); });
    expect(clearBtn).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(clearBtn).not.toBeDisabled();
  });

  it('4. ROOM_FINISH logic', async () => {
    await renderComponent();
    const finishTrigger = screen.getByRole('button', { name: /Завершить/i, exact: false });
    await act(async () => { fireEvent.click(finishTrigger); });
    
    const confirmFinishBtns = screen.getAllByRole('button', { name: /^Завершить$/i });
    const confirmFinishBtn = confirmFinishBtns[confirmFinishBtns.length - 1]; // last one is in dialog
    
    // Success
    await act(async () => { fireEvent.click(confirmFinishBtn); });
    expect(confirmFinishBtn).toBeDisabled();
    await act(async () => { eventCallbackMap['ROOM_FINISH']({ success: true }); });
    
    // Check if dialog closes (button should be re-enabled at least while unmounting)
    expect(confirmFinishBtn).not.toBeDisabled();
    
    // Reopen
    await act(async () => { fireEvent.click(finishTrigger); });
    const reopenConfirmBtns = screen.getAllByRole('button', { name: /^Завершить$/i });
    const reopenConfirmBtn = reopenConfirmBtns[reopenConfirmBtns.length - 1];
    
    // Timeout
    await act(async () => { fireEvent.click(reopenConfirmBtn); });
    expect(reopenConfirmBtn).toBeDisabled();
    await act(async () => { vi.runAllTimers(); });
    expect(reopenConfirmBtn).not.toBeDisabled();
    
    // Late callback
    await act(async () => { eventCallbackMap['ROOM_FINISH']({ success: true }); });
    expect(reopenConfirmBtn).not.toBeDisabled();
  });

  it('5. Lifecycle disconnect', async () => {
    await renderComponent();
    
    const startBtn = screen.getByRole('button', { name: /СТАРТ РАУНДА/i });
    await act(async () => { fireEvent.click(startBtn); });
    expect(startBtn).toBeDisabled();
    
    // Disconnect
    await act(async () => {
      // @ts-ignore
      const disconnectCalls = socket.on.mock.calls.filter((call: any) => call[0] === 'disconnect');
      disconnectCalls.forEach((call: any) => call[1]());
    });
    
    expect(startBtn).not.toBeDisabled();
    expect(screen.getByText('Соединение с сервером потеряно')).toBeInTheDocument();
    
    // Ensure timeout doesn't do anything crazy
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(startBtn).not.toBeDisabled();
  });
});
