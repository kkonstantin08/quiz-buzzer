import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GameResult, RoomState, type PublicRoomData } from "shared";
import { AriaLiveProvider } from "../../lib/AriaLiveContext";
import { socket } from "../../realtime/socket";
import { HostRoom } from "../HostRoom";

vi.mock("../../realtime/socket", () => ({
  socket: { connected: true, connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock("../../services/api", () => ({
  api: { getSettings: vi.fn().mockResolvedValue({ soundEnabled: true, soundTheme: "classic" }) },
  BASE_URL: "http://localhost:3000/api",
}));

type MockSocket = {
  connected: boolean;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};
const mockSocket = socket as unknown as MockSocket;

const waitingRoom: PublicRoomData = {
  roomId: "room-1", roomCode: "ABC123", participants: [], roundState: RoomState.WAITING,
  firstBuzzerId: null, createdAt: 1, isHostConnected: true,
};

describe("HostRoom results", () => {
  const handlers = new Map<string, (payload: PublicRoomData) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event: string, handler: (payload: PublicRoomData) => void) => {
      if (event === "ROOM_STATE_UPDATED") handlers.set(event, handler);
      return mockSocket;
    });
    mockSocket.emit.mockImplementation((event: string, _data: unknown, callback?: (result: unknown) => void) => {
      if (event === "HOST_REJOIN_ROOM") callback?.({ success: true, room: waitingRoom });
      return mockSocket;
    });
  });

  const renderRoom = () => render(
    <AriaLiveProvider>
      <MemoryRouter initialEntries={["/host/room/room-1"]}>
        <Routes><Route path="/host/room/:roomId" element={<HostRoom />} /></Routes>
      </MemoryRouter>
    </AriaLiveProvider>,
  );

  const finish = (room: PublicRoomData) => {
    act(() => handlers.get("ROOM_STATE_UPDATED")?.(room));
  };

  it("renders a winner name, score, and announcement", async () => {
    renderRoom();
    await screen.findByText("Игра активна");
    finish({
      ...waitingRoom,
      participants: [{ id: "p1", displayName: "Игрок 1", score: 7, joinedAt: 1, isConnected: true }],
      roundState: RoomState.FINISHED,
      gameResult: GameResult.WINNER,
      winnerName: "Игрок 1",
    });

    expect(await screen.findByText("Игрок 1")).toBeInTheDocument();
    expect(screen.getByText("7 баллов")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена. Победитель: Игрок 1.")).toBeInTheDocument();
  });

  it("renders a draw with a null winnerName and announcement", async () => {
    renderRoom();
    await screen.findByText("Игра активна");
    finish({
      ...waitingRoom,
      participants: [
        { id: "p1", displayName: "Игрок 1", score: 5, joinedAt: 1, isConnected: true },
        { id: "p2", displayName: "Игрок 2", score: 5, joinedAt: 1, isConnected: true },
      ],
      roundState: RoomState.FINISHED,
      gameResult: GameResult.DRAW,
      winnerName: null,
    });

    expect(await screen.findByText("Ничья")).toBeInTheDocument();
    expect(screen.getByText("5 баллов у лидеров")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена. Ничья.")).toBeInTheDocument();
  });

  it("renders no winner and announcement", async () => {
    renderRoom();
    await screen.findByText("Игра активна");
    finish({
      ...waitingRoom,
      participants: [{ id: "p1", displayName: "Игрок 1", score: 0, joinedAt: 1, isConnected: true }],
      roundState: RoomState.FINISHED,
      gameResult: GameResult.NO_WINNER,
      winnerName: null,
    });

    expect(await screen.findByText("Нет победителя")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена без победителя.")).toBeInTheDocument();
  });
});
