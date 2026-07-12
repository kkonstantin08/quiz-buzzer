import { act, render, screen, waitFor } from "@testing-library/react";
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
});
