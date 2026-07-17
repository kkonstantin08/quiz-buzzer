import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RoomState, type PublicRoomData } from "shared";
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

const participant = { id: "participant-1", displayName: "Игрок", joinedAt: 1, isConnected: true, score: 0 };
const activeRoom: PublicRoomData = {
  roomId: "room-1", roomCode: "ABC123", participants: [participant], roundState: RoomState.ACTIVE,
  firstBuzzerId: null, createdAt: 1, isHostConnected: true,
};

describe("ParticipantRoom interactions", () => {
  const handlers = new Map<string, (payload?: unknown) => void>();
  let storage: Map<string, string>;
  let buzzResult: unknown = { success: true, status: "accepted" };

  const renderRoom = () => render(
    <AriaLiveProvider>
      <MemoryRouter initialEntries={["/room/ABC123"]}>
        <Routes><Route path="/room/:roomCode" element={<ParticipantRoom />} /></Routes>
      </MemoryRouter>
    </AriaLiveProvider>,
  );

  const buzzer = () => screen.getByRole("button", { name: "Игровой пульт (Buzzer)" });

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
    localStorage.setItem("quiz_participant_ABC123", JSON.stringify({ participantId: participant.id, reconnectToken: "token" }));
    buzzResult = { success: true, status: "accepted" };
    mockSocket.connected = true;
    mockSocket.on.mockImplementation((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
      return mockSocket;
    });
    mockSocket.emit.mockImplementation((event: string, _data: unknown, callback?: (result: unknown) => void) => {
      if (event === "PARTICIPANT_REJOIN") callback?.({ success: true, room: activeRoom, participant });
      if (event === "BUZZ_SUBMIT") callback?.(buzzResult);
      return mockSocket;
    });
  });

  it("shows pending states and keeps a successful buzz locked until a winner snapshot arrives", async () => {
    let deferredCallback: ((result: unknown) => void) | null = null;
    mockSocket.emit.mockImplementation((event: string, _data: unknown, callback?: (result: unknown) => void) => {
      if (event === "PARTICIPANT_REJOIN") callback?.({ success: true, room: activeRoom, participant });
      if (event === "BUZZ_SUBMIT") deferredCallback = callback || null;
      return mockSocket;
    });

    renderRoom();
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" }));

    expect(buzzer()).toBeDisabled();
    expect(screen.getAllByText(/Отправляем сигнал/)[0]).toBeInTheDocument();

    act(() => { deferredCallback?.(buzzResult); });

    expect(screen.getAllByText(/Сигнал принят/)[0]).toBeInTheDocument();
    expect(buzzer()).toBeDisabled();

    act(() => handlers.get("ROOM_STATE_UPDATED")?.({ ...activeRoom, roundState: RoomState.REVEALED, firstBuzzerId: participant.id }));
    expect(await screen.findByText("Вы нажали первым!")).toBeInTheDocument();
  });

  it("releases the button and shows error if the callback times out", async () => {
    mockSocket.emit.mockImplementation((event: string, _data: unknown, callback?: (result: unknown) => void) => {
      if (event === "PARTICIPANT_REJOIN") callback?.({ success: true, room: activeRoom, participant });
      // intentionally do not call callback for BUZZ_SUBMIT
      return mockSocket;
    });

    renderRoom();
    const btn = await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });

    vi.useFakeTimers();
    fireEvent.pointerDown(btn);

    expect(buzzer()).toBeDisabled();
    expect(screen.getAllByText(/Отправляем сигнал/)[0]).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5000); });

    vi.useRealTimers();
    expect(await screen.findByText(/Ошибка сети/)).toBeInTheDocument();
    expect(buzzer()).toBeEnabled();
  });

  it("uses stable participantId to render a losing snapshot and clears local lock after reset", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "PARTICIPANT_REJOIN",
      { roomCode: "ABC123", participantId: participant.id, reconnectToken: "token" },
      expect.any(Function),
    );

    act(() => handlers.get("ROOM_STATE_UPDATED")?.({ ...activeRoom, roundState: RoomState.REVEALED, firstBuzzerId: "other-participant" }));
    expect(await screen.findByText(/Кто-то успел раньше/)).toBeInTheDocument();

    act(() => handlers.get("ROOM_STATE_UPDATED")?.({ ...activeRoom, roundState: RoomState.WAITING }));
    act(() => handlers.get("ROOM_STATE_UPDATED")?.(activeRoom));
    await waitFor(() => expect(buzzer()).toBeEnabled());
  });

  it("re-enables the button after a rejected buzz callback while the round remains active", async () => {
    buzzResult = { success: false, error: "Сигнал отклонён" };
    renderRoom();
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" }));

    await waitFor(() => expect(buzzer()).toBeEnabled());
    expect(await screen.findByText("Сигнал отклонён")).toBeInTheDocument();
  });

  it("submits exactly once for keyboard activation and ignores the native click that follows", async () => {
    renderRoom();
    const button = await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);

    expect(mockSocket.emit.mock.calls.filter(([event]) => event === "BUZZ_SUBMIT")).toHaveLength(1);
  });

  it("supports Space and pointer input with one submit per component mount", async () => {
    const first = renderRoom();
    fireEvent.keyDown(await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" }), { key: " " });
    expect(mockSocket.emit.mock.calls.filter(([event]) => event === "BUZZ_SUBMIT")).toHaveLength(1);
    first.unmount();

    renderRoom();
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" }));
    expect(mockSocket.emit.mock.calls.filter(([event]) => event === "BUZZ_SUBMIT")).toHaveLength(2);
  });

  it("clears the saved session and blocks control after revocation", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "Игровой пульт (Buzzer)" });
    act(() => handlers.get("PARTICIPANT_CONTROL_REVOKED")?.());

    expect(localStorage.getItem("quiz_participant_ABC123")).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent("другого устройства или вкладки");
    expect(screen.queryByRole("button", { name: "Игровой пульт (Buzzer)" })).not.toBeInTheDocument();
  });
});
