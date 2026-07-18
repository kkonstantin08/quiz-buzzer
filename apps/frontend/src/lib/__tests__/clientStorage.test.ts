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

  it("saves, reads, and expires participant reconnect records after the room lifetime", () => {
    saveParticipantSession("ROOM", "p1", "token");

    expect(readParticipantSession("ROOM")).toEqual({
      participantId: "p1",
      reconnectToken: "token",
      createdAt: "2026-07-18T12:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    });

    vi.advanceTimersByTime(PARTICIPANT_SESSION_TTL_MS);
    expect(readParticipantSession("ROOM")).toBeNull();
    expect(localStorage.getItem("quiz_participant_ROOM")).toBeNull();
  });
});
