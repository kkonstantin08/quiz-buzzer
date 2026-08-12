import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameResult } from 'shared';
import { GameHistoryResult } from '../GameHistoryResult';
import type { GameHistoryItem } from '../../services/api';

const baseGame: GameHistoryItem = {
  id: 'game-1',
  roomCode: 'ABC123',
  result: GameResult.WINNER,
  winnerName: 'Анна',
  winnerScore: 7,
  participants: 4,
  createdAt: '2026-08-12T09:00:00.000Z',
};

describe('GameHistoryResult', () => {
  it('shows the winner name, score, and crown only for WINNER', () => {
    render(<GameHistoryResult game={baseGame} />);

    expect(screen.getByText('Анна')).toBeInTheDocument();
    expect(screen.getByText('7 баллов')).toBeInTheDocument();
    expect(screen.getByLabelText('Победитель')).toBeInTheDocument();
  });

  it.each([
    [GameResult.DRAW, 'Ничья'],
    [GameResult.NO_WINNER, 'Без победителя'],
    ['UNEXPECTED', 'Без победителя'],
  ])('renders %s without a fictitious winner', (result, label) => {
    render(<GameHistoryResult game={{ ...baseGame, result: result as GameResult }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Анна')).not.toBeInTheDocument();
    expect(screen.queryByText('7 баллов')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Победитель')).not.toBeInTheDocument();
  });
});
