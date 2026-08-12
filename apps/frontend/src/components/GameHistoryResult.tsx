import { CircleMinus, Crown, Scale } from 'lucide-react';
import { GameResult } from 'shared';
import type { GameHistoryItem } from '../services/api';

export function GameHistoryResult({ game }: { game: GameHistoryItem }) {
  if (game.result === GameResult.WINNER && game.winnerName) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
        <Crown aria-label="Победитель" className="text-amber-500" />
        <span>{game.winnerName}</span>
        <span className="text-sm font-medium text-amber-700">{game.winnerScore} баллов</span>
      </span>
    );
  }

  if (game.result === GameResult.DRAW) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
        <Scale aria-hidden="true" />
        Ничья
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
      <CircleMinus aria-hidden="true" />
      Без победителя
    </span>
  );
}
