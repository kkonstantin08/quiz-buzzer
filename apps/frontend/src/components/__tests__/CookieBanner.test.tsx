import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CookieBanner } from "../CookieBanner";

const STORAGE_KEY = "quiz_cookie_notice_acknowledgement";

describe("CookieBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows when the acknowledgement is absent, malformed, or from an older notice version", () => {
    for (const value of [null, "{broken", JSON.stringify({ noticeVersion: "0.9", acknowledgedAt: new Date().toISOString() })]) {
      localStorage.clear();
      if (value) localStorage.setItem(STORAGE_KEY, value);
      const view = render(<MemoryRouter><CookieBanner /></MemoryRouter>);

      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByRole("button", { name: "Понятно" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps the banner hidden only for the current version acknowledgement", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ noticeVersion: "1.0", acknowledgedAt: "2026-07-18T00:00:00.000Z" }));
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByRole("button", { name: "Понятно" })).not.toBeInTheDocument();
  });

  it.each([
    ["Понятно", "button"],
    ["Закрыть", "close button"],
  ])("stores the same acknowledgement when dismissed with %s", (label) => {
    localStorage.setItem("cookieConsent", "true");
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(1000));

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(localStorage.getItem("cookieConsent")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      noticeVersion: "1.0",
      acknowledgedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});
