import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoomState, GameResult, type PublicRoomData } from "shared";
import { AriaLiveProvider } from "../../lib/AriaLiveContext";
import { socket } from "../../realtime/socket";
import { ParticipantRoom } from "../ParticipantRoom";

vi.mock("../../realtime/socket", () => ({
  socket: { connected: true, connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock("../../realtime/timeSync", () => ({ timeSync: { getServerTime: vi.fn(() => Date.now()) } }));
vi.mock("../../services/api", () => ({ api: {}, BASE_URL: "http://localhost:3000/api" }));

type MockSocket = {
  connected: boolean;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};
const mockSocket = socket as unknown as MockSocket;

describe("ParticipantRoom results", () => {
  const handlers = new Map<string, (payload?: unknown) => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    const storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
    const sessionCreatedAt = Date.now();
    localStorage.setItem("quiz_participant_ABC123", JSON.stringify({
      participantId: "p1",
      reconnectToken: "token",
      createdAt: new Date(sessionCreatedAt).toISOString(),
      expiresAt: new Date(sessionCreatedAt + 24 * 60 * 60 * 1000).toISOString(),
    }));
    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
      return mockSocket;
    });
    mockSocket.emit.mockImplementation((event: string, _data: unknown, callback?: (result: unknown) => void) => {
      if (event === "PARTICIPANT_REJOIN") {
        callback?.({ 
          success: true, 
          room: {
            roomId: "room-1", roomCode: "ABC123", 
            participants: [{ id: "p1", displayName: "Игрок 1", joinedAt: 1, isConnected: true, score: 0 }], 
            roundState: RoomState.ACTIVE, firstBuzzerId: null, createdAt: 1, isHostConnected: true
          }, 
          participant: { id: "p1", displayName: "Игрок 1", joinedAt: 1, isConnected: true, score: 0 }
        });
      }
      return mockSocket;
    });
  });

  const renderRoom = () => render(
    <AriaLiveProvider>
      <MemoryRouter initialEntries={["/room/ABC123"]}>
        <Routes><Route path="/room/:roomCode" element={<ParticipantRoom />} /></Routes>
      </MemoryRouter>
    </AriaLiveProvider>,
  );

  it("renders WINNER state correctly", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    
    act(() => {
      handlers.get("ROOM_STATE_UPDATED")?.({
        roomId: "room-1", roomCode: "ABC123", 
        participants: [
          { id: "p1", displayName: "Игрок 1", score: 0 },
          { id: "p2", displayName: "Игрок 2", score: 5 },
        ], 
        roundState: RoomState.FINISHED,
        gameResult: GameResult.WINNER,
        winnerName: "Игрок 2"
      });
    });

    expect(await screen.findByText("Победитель!")).toBeInTheDocument();
    expect(screen.getByText("Игрок 2")).toBeInTheDocument();
    expect(screen.getByText("Счёт: 5")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена. Победитель: Игрок 2.")).toBeInTheDocument();
  });

  it("renders DRAW state correctly", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    
    act(() => {
      handlers.get("ROOM_STATE_UPDATED")?.({
        roomId: "room-1", roomCode: "ABC123", 
        participants: [
          { id: "p1", displayName: "Игрок 1", score: 5 },
          { id: "p2", displayName: "Игрок 2", score: 5 },
        ], 
        roundState: RoomState.FINISHED,
        gameResult: GameResult.DRAW,
        winnerName: null
      });
    });

    expect(await screen.findByText("Ничья!")).toBeInTheDocument();
    expect(screen.getByText("Победила дружба")).toBeInTheDocument();
    expect(screen.getByText("Счёт: 5")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена. Ничья.")).toBeInTheDocument();
  });

  it("renders NO_WINNER state correctly", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    
    act(() => {
      handlers.get("ROOM_STATE_UPDATED")?.({
        roomId: "room-1", roomCode: "ABC123", 
        participants: [
          { id: "p1", displayName: "Игрок 1", score: 0 },
          { id: "p2", displayName: "Игрок 2", score: 0 },
        ], 
        roundState: RoomState.FINISHED,
        gameResult: GameResult.NO_WINNER,
        winnerName: null
      });
    });

    expect(await screen.findByText("Игра завершена")).toBeInTheDocument();
    expect(screen.getByText("Нет победителя")).toBeInTheDocument();
    expect(screen.getByText("Игра завершена без победителя.")).toBeInTheDocument();
  });
});
