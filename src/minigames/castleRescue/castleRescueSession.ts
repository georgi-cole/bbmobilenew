import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { computePlatformerFinalScore } from './castleRescuePlatformerLogic';

export type CastleRescueEndReason = 'rescued' | 'timeout' | 'out_of_lives';

interface LifeLossState {
  hearts: number;
  score: number;
  startTime: number;
  princessRescued: boolean;
  finalElapsedMs: number;
  finalScore: number;
  phase: string;
  endReason: CastleRescueEndReason;
}

export function resolveCastleRescueRunSeed(
  seed: number | undefined,
  makeSeed: () => number = cryptoSeed,
): number {
  return seed !== undefined && seed !== 0 ? seed : makeSeed();
}

export function applyCastleRescueLifeLoss(
  gs: LifeLossState,
  now: number,
  deathPenalty: number,
  outOfLivesPenalty: number,
  computeFinalScore: (state: Pick<LifeLossState, 'score' | 'princessRescued'>, elapsedMs: number) => number = computePlatformerFinalScore,
): boolean {
  gs.hearts = Math.max(0, gs.hearts - 1);
  gs.score = Math.max(0, gs.score - deathPenalty);
  if (gs.hearts > 0) return false;

  gs.score = Math.max(0, gs.score - outOfLivesPenalty);
  const elapsed = Math.max(0, now - gs.startTime);
  gs.finalElapsedMs = elapsed;
  gs.finalScore = computeFinalScore(gs, elapsed);
  gs.endReason = 'out_of_lives';
  gs.phase = 'complete';
  return true;
}
