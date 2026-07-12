import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoomState, type PublicRoomData } from "shared";
import { HostRoom } from "../HostRoom";
import { socket } from "../../realtime/socket";

vi.mock("../../realtime/socket", () => ({
  socket: {
    connected: true,
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock("../../services/api", () => ({
  api: { getSettings: vi.fn().mockResolvedValue({ soundEnabled: true, soundTheme: "classic" }) },
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

const waitingRoom: PublicRoomData = {
  roomId: "room-1",
  roomCode: "ABC123",
  participants: [
    { id: "participant-1", displayName: "Игрок", joinedAt: 1, isConnected: true, score: 0 },
  ],
  roundState: RoomState.WAITING,
  firstBuzzerId: null,
  createdAt: 1,
  isHostConnected: true,
};

describe("HostRoom state listener", () => {
  let onStateUpdate: ((room: PublicRoomData) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event: string, handler: unknown) => {
      if (event === "ROOM_STATE_UPDATED") {
        onStateUpdate = handler as (room: PublicRoomData) => void;
      }
      return mockSocket;
    });
  });

  it("registers one listener while retaining the latest rapid room snapshot", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/host/room/room-1", state: { room: waitingRoom } }]}>
        <Routes>
          <Route path="/host/room/:roomId" element={<HostRoom />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Игра активна");
    expect(onStateUpdate).toBeDefined();

    act(() => {
      onStateUpdate?.({ ...waitingRoom, roundState: RoomState.ACTIVE });
      onStateUpdate?.({
        ...waitingRoom,
        roundState: RoomState.REVEALED,
        firstBuzzerId: "participant-1",
      });
    });

    expect(await screen.findAllByText("Игрок")).toHaveLength(2);
    await waitFor(() => {
      expect(
        mockSocket.on.mock.calls.filter(([event]) => event === "ROOM_STATE_UPDATED"),
      ).toHaveLength(1);
    });
  });

  it("shows the callback error when score clearing is rejected", async () => {
    mockSocket.emit.mockImplementation(
      (event: string, callback?: (result: unknown) => void) => {
        if (event === "HOST_CLEAR_SCORES") {
          callback?.({ success: false, error: "Управление отозвано" });
        }
        return mockSocket;
      },
    );

    render(
      <MemoryRouter initialEntries={[{ pathname: "/host/room/room-1", state: { room: waitingRoom } }]}>
        <Routes>
          <Route path="/host/room/:roomId" element={<HostRoom />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Очистить счёт" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Управление отозвано");
    expect(mockSocket.emit).toHaveBeenCalledWith("HOST_CLEAR_SCORES", expect.any(Function));
  });
});
