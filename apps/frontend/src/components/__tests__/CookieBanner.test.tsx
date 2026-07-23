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

  it("shows when preferences are absent, malformed, or from an older format", () => {
    for (const value of [null, "{broken", JSON.stringify({ noticeVersion: "0.9", acknowledgedAt: new Date().toISOString() })]) {
      localStorage.clear();
      if (value) localStorage.setItem(STORAGE_KEY, value);
      const view = render(<MemoryRouter><CookieBanner /></MemoryRouter>);

      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByRole("button", { name: "Только необходимые" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Разрешить аналитику" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps the banner hidden only for current category preferences", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      noticeVersion: "1.0",
      decidedAt: "2026-07-18T00:00:00.000Z",
      categories: { necessary: true, analytics: false },
    }));
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByRole("button", { name: "Только необходимые" })).not.toBeInTheDocument();
  });

  it.each([
    ["Только необходимые", false],
    ["Разрешить аналитику", true],
  ])("stores a category choice when selecting %s", (label, analytics) => {
    localStorage.setItem("cookieConsent", "true");
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(1000));

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(localStorage.getItem("cookieConsent")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      noticeVersion: "1.0",
      decidedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      categories: { necessary: true, analytics },
    });
  });

  it("reopens the settings after a saved choice", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      noticeVersion: "1.0",
      decidedAt: "2026-07-18T00:00:00.000Z",
      categories: { necessary: true, analytics: false },
    }));
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(1000));

    act(() => window.dispatchEvent(new Event("quiz:open-cookie-settings")));

    expect(screen.getByRole("button", { name: "Разрешить аналитику" })).toBeInTheDocument();
  });

  it("keeps the choice buttons in one column inside the narrow banner", () => {
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(1000));

    const controls = screen.getByRole("button", { name: "Разрешить аналитику" }).parentElement;
    expect(controls).toHaveClass("flex-col");
    expect(controls).not.toHaveClass("sm:flex-row");
  });

  it("has a non-modal dialog role labelled by its heading", () => {
    render(<MemoryRouter><CookieBanner /></MemoryRouter>);
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole("dialog", { name: "Настройки cookie" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
