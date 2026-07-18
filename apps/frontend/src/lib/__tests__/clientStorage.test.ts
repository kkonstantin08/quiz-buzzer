import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NOTICE_STORAGE_KEY, acknowledgeCookieNotice, shouldShowCookieNotice } from "../cookieNoticeStorage";
import { PARTICIPANT_SESSION_TTL_MS, readParticipantSession, saveParticipantSession } from "../participantSessionStorage";

describe("client storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the current cookie acknowledgement with an ISO timestamp and clears the legacy key", () => {
    localStorage.setItem("cookieConsent", "true");

    acknowledgeCookieNotice();

    expect(localStorage.getItem("cookieConsent")).toBeNull();
    expect(JSON.parse(localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY)!)).toEqual({
      noticeVersion: "1.0",
      acknowledgedAt: "2026-07-18T12:00:00.000Z",
    });
    expect(shouldShowCookieNotice()).toBe(false);
  });

  it("rejects malformed and legacy participant reconnect records", () => {
    for (const value of ["{broken", JSON.stringify({ participantId: "p1", reconnectToken: "token" })]) {
      localStorage.setItem("quiz_participant_ROOM", value);

      expect(readParticipantSession("ROOM")).toBeNull();
      expect(localStorage.getItem("quiz_participant_ROOM")).toBeNull();
    }
  });

  it("limits a late participant join to the room's remaining lifetime", () => {
    const roomCreatedAt = Date.now() - 23 * 60 * 60 * 1000;

    saveParticipantSession("ROOM", "p1", "token", roomCreatedAt);

    expect(readParticipantSession("ROOM")).toEqual({
      participantId: "p1",
      reconnectToken: "token",
      createdAt: "2026-07-18T12:00:00.000Z",
      expiresAt: "2026-07-18T13:00:00.000Z",
    });
  });

  it("accepts a reconnect record lasting exactly 24 hours", () => {
    saveParticipantSession("ROOM", "p1", "token", Date.now());

    expect(readParticipantSession("ROOM")).toEqual({
      participantId: "p1",
      reconnectToken: "token",
      createdAt: "2026-07-18T12:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    });
  });

  it("expires a reconnect record after the room lifetime", () => {
    saveParticipantSession("ROOM", "p1", "token", Date.now());
    vi.advanceTimersByTime(PARTICIPANT_SESSION_TTL_MS);

    expect(readParticipantSession("ROOM")).toBeNull();
    expect(localStorage.getItem("quiz_participant_ROOM")).toBeNull();
  });

  it.each([
    ["a duration longer than 24 hours", "2026-07-18T12:00:00.000Z", "2026-07-19T12:00:00.001Z"],
    ["a createdAt date in the future", "2026-07-18T12:00:00.001Z", "2026-07-19T12:00:00.001Z"],
  ])("removes a reconnect record with %s", (_reason, createdAt, expiresAt) => {
    localStorage.setItem("quiz_participant_ROOM", JSON.stringify({
      participantId: "p1",
      reconnectToken: "token",
      createdAt,
      expiresAt,
    }));

    expect(readParticipantSession("ROOM")).toBeNull();
    expect(localStorage.getItem("quiz_participant_ROOM")).toBeNull();
  });
});
