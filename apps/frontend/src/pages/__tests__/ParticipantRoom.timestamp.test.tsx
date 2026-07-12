import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AriaLiveProvider } from "../../lib/AriaLiveContext";
import { ParticipantRoom } from "../ParticipantRoom";
import { socket } from "../../realtime/socket";
import { RoomState, type PublicRoomData } from "shared";

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
  timeSync: {
    getServerTime: vi.fn(() => 1_005_000),
  },
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

describe("ParticipantRoom buzz timestamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({}) }),
    );
    localStorage.setItem(
      "quiz_participant_ABC123",
      JSON.stringify({
        participantId: "participant-1",
        reconnectToken: "reconnect-token",
      }),
    );
    mockSocket.connected = true;
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    mockSocket.emit.mockImplementation(
      (event: string, _data: unknown, callback?: (response: unknown) => void) => {
      if (event === "PARTICIPANT_REJOIN") {
        callback?.({
          success: true,
          room: activeRoom,
          participant: activeRoom.participants[0],
        });
      }
      if (event === "BUZZ_SUBMIT") {
        callback?.({ success: true, status: "accepted" });
      }
      return mockSocket;
      },
    );
  });

  it("submits the raw client clock even when TimeSync has a positive offset", async () => {
    render(
      <AriaLiveProvider>
        <MemoryRouter initialEntries={["/room/ABC123"]}>
          <Routes>
            <Route path="/room/:roomCode" element={<ParticipantRoom />} />
          </Routes>
        </MemoryRouter>
      </AriaLiveProvider>,
    );

    const buzzer = await screen.findByRole("button", {
      name: "Игровой пульт (Buzzer)",
    });
    fireEvent.pointerDown(buzzer);

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "BUZZ_SUBMIT",
        { clientPressedAt: 1_000_000 },
        expect.any(Function),
      );
    });
  });
});
