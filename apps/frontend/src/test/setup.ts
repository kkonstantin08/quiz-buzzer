import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

// Mock sounds
vi.mock('../lib/sounds', () => ({
  playSound: vi.fn(),
}));
