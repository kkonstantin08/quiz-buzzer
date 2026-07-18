import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoomState, type PublicRoomData } from "shared";
import { AriaLiveProvider } from "../../lib/AriaLiveContext";
import { socket } from "../../realtime/socket";
import { ParticipantRoom } from "../ParticipantRoom";

vi.mock("../../realtime/socket", () => ({
  socket: {
    connected: true,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("../../realtime/timeSync", () => ({
  timeSync: { getServerTime: vi.fn(() => 1_000_000) },
}));

vi.mock("../../services/api", () => ({
  api: {},
  BASE_URL: "http://localhost:3000/api",
}));

type MockSocket = {
  connected: boolean;
  connect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

const mockSocket = socket as unknown as MockSocket;

const activeRoom: PublicRoomData = {
  roomId: "room-1",
  roomCode: "ABC123",
  participants: [
    {
      id: "participant-1",
      displayName: "Игрок",
      joinedAt: 1,
      isConnected: true,
      score: 0,
    },
  ],
  roundState: RoomState.ACTIVE,
  firstBuzzerId: null,
  createdAt: 1,
  isHostConnected: true,
};

describe("ParticipantRoom state listener", () => {
  let onStateUpdate: ((room: PublicRoomData) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
    localStorage.setItem(
      "quiz_participant_ABC123",
      JSON.stringify({
        participantId: "participant-1",
        reconnectToken: "reconnect-token",
      }),
    );

    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event: string, handler: unknown) => {
      if (event === "ROOM_STATE_UPDATED") {
        onStateUpdate = handler as (room: PublicRoomData) => void;
      }
      return mockSocket;
    });
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, callback?: (response: unknown) => void) => {
        if (event === "PARTICIPANT_REJOIN") {
          callback?.({
            success: true,
            room: activeRoom,
            participant: activeRoom.participants[0],
          });
        }
        return mockSocket;
      },
    );
  });

  it("registers one state listener while processing rapid snapshots in order", async () => {
    render(
      <AriaLiveProvider>
        <MemoryRouter initialEntries={["/room/ABC123"]}>
          <Routes>
            <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          </Routes>
        </MemoryRouter>
      </AriaLiveProvider>,
    );

    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    expect(onStateUpdate).toBeDefined();

    act(() => {
      onStateUpdate?.({ ...activeRoom, roundState: RoomState.WAITING });
      onStateUpdate?.({ ...activeRoom, roundState: RoomState.ACTIVE });
      onStateUpdate?.({
        ...activeRoom,
        roundState: RoomState.REVEALED,
        firstBuzzerId: "participant-1",
      });
    });

    await screen.findByText("Вы нажали первым!");
    await waitFor(() => {
      expect(
        mockSocket.on.mock.calls.filter(([event]) => event === "ROOM_STATE_UPDATED"),
      ).toHaveLength(1);
    });
  });

  it("cleans up both connect and connect_error listeners regardless of which fires first", async () => {
    // Start disconnected
    mockSocket.connected = false;

    // Capture the `on` handlers registered during join attempt
    const onHandlers: Record<string, Function> = {};
    mockSocket.on.mockImplementation((event: string, handler: Function) => {
      onHandlers[event] = handler;
      return mockSocket;
    });

    const { unmount } = render(
      <AriaLiveProvider>
        <MemoryRouter initialEntries={["/room/ABC123"]}>
          <Routes>
            <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          </Routes>
        </MemoryRouter>
      </AriaLiveProvider>,
    );

    // Enter name and try to join
    const input = await screen.findByPlaceholderText("Имя или игровой псевдоним");
    const joinButton = screen.getByRole("button", { name: "Войти в игру" });

    act(() => {
      fireEvent.change(input, { target: { value: "ТестИгрок" } });
      fireEvent.click(joinButton);
    });

    await waitFor(() => {
      expect(onHandlers.connect).toBeDefined();
      expect(onHandlers.connect_error).toBeDefined();
    });

    // Simulate connect_error
    act(() => {
      onHandlers.connect_error!(new Error("test error"));
    });

    // Verify both were removed
    expect(mockSocket.off).toHaveBeenCalledWith("connect_error", onHandlers.connect_error);
    expect(mockSocket.off).toHaveBeenCalledWith("connect", onHandlers.connect);

    // clear mocks
    mockSocket.off.mockClear();
    
    // Simulate another join to test unmount
    act(() => {
      fireEvent.click(joinButton);
    });

    // simulate unmount
    unmount();
    
    // Should remove both on unmount
    expect(mockSocket.off).toHaveBeenCalledWith("connect_error", expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith("connect", expect.any(Function));
  });

  it("auth error does not remove listeners and is handled distinctly", async () => {
    mockSocket.connected = false;
    const onHandlers: Record<string, Function> = {};
    mockSocket.on.mockImplementation((event: string, handler: Function) => {
      onHandlers[event] = handler;
      return mockSocket;
    });

    render(
      <AriaLiveProvider>
        <MemoryRouter initialEntries={["/room/ABC123"]}>
          <Routes>
            <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          </Routes>
        </MemoryRouter>
      </AriaLiveProvider>,
    );

    const input = await screen.findByPlaceholderText("Имя или игровой псевдоним");
    const joinButton = screen.getByRole("button", { name: "Войти в игру" });

    act(() => {
      fireEvent.change(input, { target: { value: "ТестИгрок" } });
      fireEvent.click(joinButton);
    });

    const error = new Error("auth");
    (error as any).data = { code: "AUTH_SESSION_INVALID" };

    act(() => {
      onHandlers.connect_error!(error);
    });

    // Verify they are NOT removed
    expect(mockSocket.off).not.toHaveBeenCalledWith("connect_error", onHandlers.connect_error);
    expect(mockSocket.off).not.toHaveBeenCalledWith("connect", onHandlers.connect);
  });
  
  it("ignores stale ROOM_JOIN callbacks", async () => {
    mockSocket.connected = true;
    let cb1: Function;
    let cb2: Function;

    mockSocket.emit.mockImplementation((event: string, data: any, callback: Function) => {
      if (event === "ROOM_JOIN") {
        if (!cb1) cb1 = callback;
        else cb2 = callback;
      }
      return mockSocket;
    });

    render(
      <AriaLiveProvider>
        <MemoryRouter initialEntries={["/room/ABC123"]}>
          <Routes>
            <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          </Routes>
        </MemoryRouter>
      </AriaLiveProvider>,
    );

    const input = await screen.findByPlaceholderText("Имя или игровой псевдоним");
    const joinButton = screen.getByRole("button", { name: "Войти в игру" });

    act(() => {
      fireEvent.change(input, { target: { value: "ТестИгрок" } });
      fireEvent.click(joinButton);
    });
    
    act(() => {
      // Simulate multiple clicks. We can't click the button if it's disabled, 
      // but we can submit the form directly to simulate an aggressive retry.
      fireEvent.submit(joinButton.closest("form")!);
    });

    act(() => {
      // Resolve first (stale) callback with success
      cb1!({ success: true, room: activeRoom, participant: activeRoom.participants[0] });
    });

    // Should still show joining as cb1 is ignored
    expect(screen.queryByText("ЖМИТЕ!")).toBeNull();
    
    act(() => {
      // Resolve second (latest) callback
      if (cb2) cb2({ success: true, room: activeRoom, participant: activeRoom.participants[0] });
    });
    
    await screen.findByText("ЖМИТЕ!");
  });
});
