import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  completeHouseOfCardsTournament,
  HOUSE_OF_CARDS_TILE_COUNTS,
  resetHouseOfCards,
  startHouseOfCards,
  type HouseOfCardsPrizeType,
  type HouseOfCardsState,
  type PlayerOutcome,
} from '../../features/houseOfCards/houseOfCardsSlice';
import { resolveHouseOfCardsOutcome } from '../../features/houseOfCards/thunks';
import {
  createHouseOfCardsAiProfiles,
  simulateHouseOfCardsAiRound,
} from '../../features/houseOfCards/houseOfCardsAi';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { useHouseOfCardsAudio } from '../../hooks/useHouseOfCardsAudio';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import {
  buildHouseOfCardsBoard,
  chooseHouseOfCardsAiPair,
  chooseHouseOfCardsFinalWinner,
  type HouseOfCardsBoardCard,
} from './houseOfCardsUtils';
import './HouseOfCardsComp.css';

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
  precomputedScore?: number;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType: HouseOfCardsPrizeType;
  seed?: number;
  onComplete?: (completion?: ReactMinigameCompletion) => void;
}

interface RoundPerformance {
  score: number;
  mistakes: number;
  timeMs: number;
}

interface RoundSummary {
  round: number;
  rankedIds: string[];
  eliminatedIds: string[];
  nextActiveIds: string[];
  roundScores: Record<string, RoundPerformance>;
  cumulativeScores: Record<string, number>;
}

type TournamentPhase = 'playing' | 'round_results' | 'final_playing' | 'results';

type BoardStyle = CSSProperties & { '--hoc-columns': number };

function hashId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function boardColumns(tileCount: number): number {
  if (tileCount <= 8) return 4;
  if (tileCount <= 16) return 4;
  if (tileCount <= 20) return 5;
  return 6;
}

export default function HouseOfCardsComp({ participantIds, participants, prizeType, seed, onComplete }: Props) {
  const dispatch = useAppDispatch();
  const [sessionSeed] = useState(() => (seed ? seed : cryptoSeed()));
  const humanId = useMemo(
    () => participants?.find((participant) => participant.isHuman)?.id ?? participantIds[0] ?? null,
    [participantIds, participants],
  );
  const nameFor = useCallback(
    (id: string) => participants?.find((participant) => participant.id === id)?.name ?? id,
    [participants],
  );
  const aiProfiles = useMemo(
    () => createHouseOfCardsAiProfiles(participantIds, humanId, sessionSeed),
    [participantIds, humanId, sessionSeed],
  );
  const hoc = useAppSelector(
    (state: RootState) => (state as RootState & { houseOfCards?: HouseOfCardsState }).houseOfCards,
  );

  const [phase, setPhase] = useState<TournamentPhase>('playing');
  const [round, setRound] = useState(1);
  const [activeIds, setActiveIds] = useState<string[]>(participantIds);
  const [cumulativeScores, setCumulativeScores] = useState<Record<string, number>>(
    () => Object.fromEntries(participantIds.map((id) => [id, 0])),
  );
  const [board, setBoard] = useState<HouseOfCardsBoardCard[]>(
    () => buildHouseOfCardsBoard(sessionSeed, HOUSE_OF_CARDS_TILE_COUNTS[0] / 2),
  );
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [finalists, setFinalists] = useState<string[]>([]);
  const [finalTurnId, setFinalTurnId] = useState<string | null>(null);
  const [finalPoints, setFinalPoints] = useState<Record<string, number>>({});
  const [finalStandings, setFinalStandings] = useState<PlayerOutcome[]>([]);

  const roundStartedAtRef = useRef(Date.now());
  const roundCompletedRef = useRef(false);
  const finalCompletedRef = useRef(false);
  const aiTurnRef = useRef(0);
  const aiMemoryRef = useRef<Set<number>>(new Set());
  const { playFlip, playMatch, playMismatch, playComplete } = useHouseOfCardsAudio(
    phase === 'playing' || phase === 'final_playing',
  );

  const tileCount = HOUSE_OF_CARDS_TILE_COUNTS[round - 1] ?? HOUSE_OF_CARDS_TILE_COUNTS[4];
  const targetPairs = tileCount / 2;
  const boardStyle: BoardStyle = { '--hoc-columns': boardColumns(tileCount) };

  const resetBoardForRound = useCallback((nextRound: number) => {
    const nextTiles = HOUSE_OF_CARDS_TILE_COUNTS[nextRound - 1];
    setRound(nextRound);
    setBoard(buildHouseOfCardsBoard(sessionSeed ^ Math.imul(nextRound, 0x85ebca6b), nextTiles / 2));
    setFlippedIndices([]);
    setLocked(false);
    setMatchedPairs(0);
    setMistakes(0);
    setStreak(0);
    setBestStreak(0);
    setElapsedSeconds(0);
    setRoundSummary(null);
    roundStartedAtRef.current = Date.now();
    roundCompletedRef.current = false;
    setPhase(nextRound === 5 ? 'final_playing' : 'playing');
  }, [sessionSeed]);

  const startFinal = useCallback((candidateIds: string[], scores: Record<string, number>) => {
    const ranked = candidateIds
      .slice()
      .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || participantIds.indexOf(a) - participantIds.indexOf(b));
    const selected = ranked.slice(0, 2);
    if (selected.length < 2) {
      const fallback = participantIds
        .filter((id) => !selected.includes(id))
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
      if (fallback) selected.push(fallback);
    }
    setFinalists(selected);
    setActiveIds(selected);
    setFinalPoints(Object.fromEntries(selected.map((id) => [id, 0])));
    setFinalTurnId(selected[0] ?? null);
    setCumulativeScores(scores);
    finalCompletedRef.current = false;
    aiTurnRef.current = 0;
    aiMemoryRef.current = new Set();
    resetBoardForRound(5);
  }, [participantIds, resetBoardForRound]);

  useEffect(() => {
    dispatch(startHouseOfCards({ participantIds, humanId, prizeType, seed: sessionSeed }));
    return () => { dispatch(resetHouseOfCards()); };
  // A remount defines a new tournament session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'playing' && phase !== 'final_playing') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - roundStartedAtRef.current) / 1_000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, round]);

  const finishPreliminaryRound = useCallback(() => {
    if (roundCompletedRef.current || round > 4) return;
    roundCompletedRef.current = true;
    const pairs = HOUSE_OF_CARDS_TILE_COUNTS[round - 1] / 2;
    const roundScores: Record<string, RoundPerformance> = {};
    activeIds.forEach((id) => {
      if (id === humanId) {
        const timeMs = Math.max(1, Date.now() - roundStartedAtRef.current);
        roundScores[id] = {
          mistakes,
          timeMs,
          score: Math.max(1, pairs * 1_000 - mistakes * 90 - Math.floor(timeMs / 1_000) + bestStreak * 15),
        };
      } else {
        roundScores[id] = simulateHouseOfCardsAiRound({
          playerId: id,
          round,
          pairCount: pairs,
          tournamentSeed: sessionSeed,
          sessionAbility: aiProfiles[id]?.sessionAbility ?? 55,
        });
      }
    });
    const nextScores = { ...cumulativeScores };
    activeIds.forEach((id) => { nextScores[id] = (nextScores[id] ?? 0) + roundScores[id].score; });
    const rankedIds = activeIds.slice().sort((a, b) => {
      if (round === 4 && nextScores[b] !== nextScores[a]) return nextScores[b] - nextScores[a];
      return roundScores[b].score - roundScores[a].score
        || roundScores[a].mistakes - roundScores[b].mistakes
        || roundScores[a].timeMs - roundScores[b].timeMs
        || nextScores[b] - nextScores[a];
    });
    const nextActiveIds = round === 4
      ? rankedIds.slice(0, 2)
      : rankedIds.length > 2 ? rankedIds.slice(0, -1) : rankedIds;
    const eliminatedIds = rankedIds.filter((id) => !nextActiveIds.includes(id));
    setCumulativeScores(nextScores);
    setRoundSummary({ round, rankedIds, eliminatedIds, nextActiveIds, roundScores, cumulativeScores: nextScores });
    setPhase('round_results');
  }, [activeIds, aiProfiles, bestStreak, cumulativeScores, humanId, mistakes, round, sessionSeed]);

  useEffect(() => {
    if (phase === 'playing' && matchedPairs >= targetPairs) finishPreliminaryRound();
  }, [finishPreliminaryRound, matchedPairs, phase, targetPairs]);

  const simulateRemainingPreliminaryRounds = useCallback((
    startRound: number,
    startingIds: string[],
    startingScores: Record<string, number>,
  ) => {
    let ids = [...startingIds];
    const scores = { ...startingScores };
    for (let simulatedRound = startRound; simulatedRound <= 4; simulatedRound += 1) {
      const pairs = HOUSE_OF_CARDS_TILE_COUNTS[simulatedRound - 1] / 2;
      const performances = Object.fromEntries(ids.map((id) => [
        id,
        simulateHouseOfCardsAiRound({
          playerId: id,
          round: simulatedRound,
          pairCount: pairs,
          tournamentSeed: sessionSeed,
          sessionAbility: aiProfiles[id]?.sessionAbility ?? 55,
        }),
      ]));
      ids.forEach((id) => { scores[id] = (scores[id] ?? 0) + performances[id].score; });
      ids.sort((a, b) => scores[b] - scores[a] || performances[b].score - performances[a].score);
      ids = simulatedRound === 4 ? ids.slice(0, 2) : ids.length > 2 ? ids.slice(0, -1) : ids;
    }
    startFinal(ids, scores);
  }, [aiProfiles, sessionSeed, startFinal]);

  const continueRound = useCallback(() => {
    if (!roundSummary) return;
    if (roundSummary.round === 4) {
      startFinal(roundSummary.nextActiveIds, roundSummary.cumulativeScores);
      return;
    }
    if (humanId && roundSummary.nextActiveIds.includes(humanId)) {
      setActiveIds(roundSummary.nextActiveIds);
      resetBoardForRound(roundSummary.round + 1);
      return;
    }
    simulateRemainingPreliminaryRounds(
      roundSummary.round + 1,
      roundSummary.nextActiveIds,
      roundSummary.cumulativeScores,
    );
  }, [humanId, resetBoardForRound, roundSummary, simulateRemainingPreliminaryRounds, startFinal]);

  const skipToResults = useCallback(() => {
    if (!roundSummary) return;
    let ids = [...roundSummary.nextActiveIds];
    const scores = { ...roundSummary.cumulativeScores };
    for (let simulatedRound = roundSummary.round + 1; simulatedRound <= 4; simulatedRound += 1) {
      const pairCount = HOUSE_OF_CARDS_TILE_COUNTS[simulatedRound - 1] / 2;
      const performances = Object.fromEntries(ids.map((id) => [id, simulateHouseOfCardsAiRound({
        playerId: id,
        round: simulatedRound,
        pairCount,
        tournamentSeed: sessionSeed,
        sessionAbility: aiProfiles[id]?.sessionAbility ?? 55,
      })]));
      ids.forEach((id) => { scores[id] = (scores[id] ?? 0) + performances[id].score; });
      ids.sort((a, b) => scores[b] - scores[a] || performances[b].score - performances[a].score);
      ids = simulatedRound === 4 ? ids.slice(0, 2) : ids.length > 2 ? ids.slice(0, -1) : ids;
    }
    const selected = ids.slice(0, 2);
    if (selected.length < 2) {
      const fallback = participantIds
        .filter((id) => !selected.includes(id))
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
      if (fallback) selected.push(fallback);
    }
    if (selected.length < 2) return;
    const finalPairCount = HOUSE_OF_CARDS_TILE_COUNTS[4] / 2;
    const firstFinalPoints = Math.max(
      1,
      Math.min(finalPairCount - 1, 7 + (((hashId(selected[0]) ^ sessionSeed) >>> 0) % 7)),
    );
    const simulatedFinalPoints = {
      [selected[0]]: firstFinalPoints,
      [selected[1]]: finalPairCount - firstFinalPoints,
    };
    const winnerId = chooseHouseOfCardsFinalWinner(selected as [string, string], simulatedFinalPoints, scores);
    const loserId = selected.find((id) => id !== winnerId) ?? selected[1];
    const orderedIds = [winnerId, loserId, ...participantIds
      .filter((id) => !selected.includes(id))
      .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))];
    const standings = orderedIds.map((id, index) => ({
      playerId: id, matchedPairs: simulatedFinalPoints[id] ?? 0, mistakes: 0, turnsTaken: 0, didFinish: true,
      completionTimeMs: null, streakBest: 0,
      clashScore: (scores[id] ?? 0) + (simulatedFinalPoints[id] ?? 0) * 10_000,
      finalRank: index + 1,
    }));
    setFinalists(selected);
    setActiveIds(selected);
    setCumulativeScores(scores);
    setFinalPoints(simulatedFinalPoints);
    setFinalStandings(standings);
    setRoundSummary(null);
    setFinalTurnId(null);
    finalCompletedRef.current = true;
    roundCompletedRef.current = true;
    setRound(5);
    setBoard(buildHouseOfCardsBoard(sessionSeed ^ Math.imul(5, 0x85ebca6b), finalPairCount));
    dispatch(completeHouseOfCardsTournament({ standings: standings.map(({ finalRank: _rank, ...outcome }) => outcome) }));
    setPhase('results');
  }, [aiProfiles, dispatch, participantIds, roundSummary, sessionSeed]);

  const resolvePair = useCallback((firstIndex: number, secondIndex: number) => {
    const first = board[firstIndex];
    const second = board[secondIndex];
    if (!first || !second) return;
    aiMemoryRef.current.add(firstIndex);
    aiMemoryRef.current.add(secondIndex);
    setLocked(true);
    if (first.symbol === second.symbol) {
      playMatch();
      setBoard((current) => current.map((card, index) =>
        index === firstIndex || index === secondIndex
          ? { ...card, isFlipped: true, isMatched: true, isMismatch: false }
          : card,
      ));
      setMatchedPairs((value) => value + 1);
      setFlippedIndices([]);
      if (phase === 'final_playing' && finalTurnId) {
        setFinalPoints((points) => ({ ...points, [finalTurnId]: (points[finalTurnId] ?? 0) + 1 }));
      } else {
        setStreak((value) => {
          const next = value + 1;
          setBestStreak((best) => Math.max(best, next));
          return next;
        });
      }
      window.setTimeout(() => setLocked(false), 260);
      return;
    }

    playMismatch();
    setBoard((current) => current.map((card, index) =>
      index === firstIndex || index === secondIndex ? { ...card, isFlipped: true, isMismatch: true } : card,
    ));
    if (phase === 'playing') {
      setMistakes((value) => value + 1);
      setStreak(0);
    }
    window.setTimeout(() => {
      setBoard((current) => current.map((card, index) =>
        index === firstIndex || index === secondIndex
          ? { ...card, isFlipped: false, isMismatch: false }
          : card,
      ));
      setFlippedIndices([]);
      if (phase === 'final_playing') {
        setFinalTurnId((turn) => finalists.find((id) => id !== turn) ?? turn);
      }
      setLocked(false);
    }, 760);
  }, [board, finalTurnId, finalists, phase, playMatch, playMismatch]);

  const handleCardClick = useCallback((cardIndex: number) => {
    if (locked || (phase !== 'playing' && phase !== 'final_playing')) return;
    if (phase === 'final_playing' && finalTurnId !== humanId) return;
    const card = board[cardIndex];
    if (!card || card.isMatched || card.isFlipped) return;
    playFlip();
    setBoard((current) => current.map((item, index) => index === cardIndex ? { ...item, isFlipped: true } : item));
    if (flippedIndices.length === 0) {
      setFlippedIndices([cardIndex]);
      return;
    }
    resolvePair(flippedIndices[0], cardIndex);
  }, [board, finalTurnId, flippedIndices, humanId, locked, phase, playFlip, resolvePair]);

  useEffect(() => {
    if (phase !== 'final_playing' || !finalTurnId || finalTurnId === humanId || locked || matchedPairs >= targetPairs) return;
    const timer = window.setTimeout(() => {
      const turn = aiTurnRef.current++;
      const pair = chooseHouseOfCardsAiPair({
        board,
        rememberedIndexes: aiMemoryRef.current,
        seed: (sessionSeed ^ hashId(finalTurnId) ^ turn) >>> 0,
        skill: 55,
      });
      if (!pair) return;
      const [firstIndex, secondIndex] = pair;
      setBoard((current) => current.map((card) =>
        card.index === firstIndex || card.index === secondIndex ? { ...card, isFlipped: true } : card,
      ));
      resolvePair(firstIndex, secondIndex);
    }, 850 + (aiTurnRef.current % 3) * 260);
    return () => window.clearTimeout(timer);
  }, [board, finalTurnId, humanId, locked, matchedPairs, phase, resolvePair, sessionSeed, targetPairs]);

  useEffect(() => {
    if (phase !== 'final_playing' || matchedPairs < targetPairs || finalCompletedRef.current || finalists.length < 2) return;
    finalCompletedRef.current = true;
    const [first, second] = finalists;
    const winnerId = chooseHouseOfCardsFinalWinner(
      [first, second],
      finalPoints,
      cumulativeScores,
    );
    const finalistLoser = finalists.find((id) => id !== winnerId)!;
    const orderedIds = [
      winnerId,
      finalistLoser,
      ...participantIds
        .filter((id) => !finalists.includes(id))
        .sort((a, b) => (cumulativeScores[b] ?? 0) - (cumulativeScores[a] ?? 0)),
    ];
    const standingsWithoutRank: Array<Omit<PlayerOutcome, 'finalRank'>> = orderedIds.map((id) => ({
      playerId: id,
      matchedPairs: finalists.includes(id) ? finalPoints[id] ?? 0 : 0,
      mistakes: 0,
      turnsTaken: 0,
      didFinish: true,
      completionTimeMs: finalists.includes(id) ? Date.now() - roundStartedAtRef.current : null,
      streakBest: 0,
      clashScore: (cumulativeScores[id] ?? 0) + (finalPoints[id] ?? 0) * 10_000,
    }));
    const ranked = standingsWithoutRank.map((outcome, index) => ({ ...outcome, finalRank: index + 1 }));
    setFinalStandings(ranked);
    dispatch(completeHouseOfCardsTournament({ standings: standingsWithoutRank }));
    playComplete();
    setPhase('results');
  }, [cumulativeScores, dispatch, finalPoints, finalists, matchedPairs, participantIds, phase, playComplete, targetPairs]);

  useEffect(() => {
    if (hoc?.status === 'complete') dispatch(resolveHouseOfCardsOutcome());
  }, [dispatch, hoc?.status]);

  const finish = useCallback(() => {
    if (finalStandings.length === 0) return;
    const rawResults = Object.fromEntries(finalStandings.map((entry) => [entry.playerId, entry.clashScore]));
    onComplete?.({
      rawValue: humanId ? rawResults[humanId] ?? 0 : 0,
      rawResults,
      authoritativeWinnerId: finalStandings[0].playerId,
      authoritativeLastPlaceId: finalStandings[finalStandings.length - 1].playerId,
    });
  }, [finalStandings, humanId, onComplete]);

  if (phase === 'round_results' && roundSummary) {
    return (
      <MinigameCompleteWrapper
        className="hoc-complete hoc-round-results"
        onContinue={continueRound}
        continueLabel={humanId && roundSummary.nextActiveIds.includes(humanId) ? 'Next round' : 'Watch the finalists'}
        continueButtonClassName="hoc-complete-continue"
        footerNode={humanId && !roundSummary.nextActiveIds.includes(humanId) ? (
            <button type="button" className="hoc-complete-continue hoc-complete-continue--secondary" onClick={skipToResults}>
            Skip to results
          </button>
        ) : undefined}
        placementsNode={
          <ol className="hoc-standings-list" aria-label={`Round ${roundSummary.round} standings`}>
            {roundSummary.rankedIds.map((id, index) => (
              <li key={id} className={`hoc-standing-row${id === humanId ? ' hoc-standing--human' : ''}${roundSummary.eliminatedIds.includes(id) ? ' hoc-standing--last' : ''}`}>
                <span className="hoc-standing-rank">{index + 1}</span>
                <div className="hoc-standing-summary">
                  <strong>{nameFor(id)}{id === humanId ? ' (You)' : ''}</strong>
                  <span>{roundSummary.roundScores[id].mistakes} misses · {(roundSummary.roundScores[id].timeMs / 1_000).toFixed(1)}s</span>
                </div>
                <strong>{roundSummary.cumulativeScores[id]}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <h2 className="hoc-complete-title">Round {roundSummary.round} complete</h2>
        <p className="hoc-round-summary">
          {roundSummary.eliminatedIds.length > 0
            ? `${roundSummary.eliminatedIds.map(nameFor).join(', ')} eliminated.`
            : 'The field advances.'}
        </p>
      </MinigameCompleteWrapper>
    );
  }

  if (phase === 'results' && finalStandings.length > 0) {
    const winner = finalStandings[0];
    return (
      <MinigameCompleteWrapper
        className="hoc-complete"
        onContinue={finish}
        continueButtonClassName="hoc-complete-continue"
        placementsNode={
          <ol className="hoc-standings-list" aria-label="Final standings">
            {finalStandings.map((outcome) => (
              <li key={outcome.playerId} className={`hoc-standing-row${outcome.finalRank === 1 ? ' hoc-standing--winner' : ''}${outcome.playerId === humanId ? ' hoc-standing--human' : ''}`}>
                <span className="hoc-standing-rank">{outcome.finalRank}</span>
                <div className="hoc-standing-summary">
                  <strong>{nameFor(outcome.playerId)}{outcome.playerId === humanId ? ' (You)' : ''}</strong>
                  <span>{finalists.includes(outcome.playerId) ? `${finalPoints[outcome.playerId] ?? 0} final pairs` : 'Eliminated in preliminaries'}</span>
                </div>
                <strong>{outcome.clashScore}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <h2 className="hoc-complete-title">🏆 {nameFor(winner.playerId)} wins House of Cards</h2>
        <p className="hoc-round-summary">Five rounds complete</p>
      </MinigameCompleteWrapper>
    );
  }

  const isFinal = phase === 'final_playing';
  const humanCanPlay = !isFinal || finalTurnId === humanId;
  return (
    <div className="hoc-root" data-phase={phase}>
      <div className="hoc-atmosphere" aria-hidden="true">
        <span /><span /><span />
      </div>
      <header className="hoc-game-heading">
        <span className="hoc-game-heading__kicker">Memory tournament</span>
        <strong>House of Cards</strong>
        <span>Reveal the deck. Match every pair.</span>
      </header>
      <div className="hoc-hud">
        <div className="hoc-hud-stat"><strong>Round {round}/5</strong><span>{tileCount} tiles</span></div>
        <div className="hoc-hud-stat"><strong>{elapsedSeconds}s</strong><span>Elapsed · no limit</span></div>
        <div className="hoc-hud-stat"><strong>{matchedPairs}/{targetPairs}</strong><span>Pairs</span></div>
        {!isFinal && <div className="hoc-hud-stat"><strong>{mistakes}</strong><span>Misses</span></div>}
        {!isFinal && <div className="hoc-hud-stat"><strong>{streak}×</strong><span>Streak</span></div>}
      </div>

      {isFinal && (
        <div className="hoc-final-score" aria-live="polite">
          <strong>{nameFor(finalists[0] ?? '')}: {finalPoints[finalists[0] ?? ''] ?? 0}</strong>
          <span>{nameFor(finalTurnId ?? '')}'s turn{humanCanPlay ? ' — choose two cards' : ' — choosing…'}</span>
          <strong>{nameFor(finalists[1] ?? '')}: {finalPoints[finalists[1] ?? ''] ?? 0}</strong>
        </div>
      )}

      <div className="hoc-board-wrap" data-round={round}>
        <div className="hoc-board" style={boardStyle} role="grid" aria-label={isFinal ? 'Shared final card grid' : `Round ${round} card grid`}>
          {board.map((card) => (
            <button
              key={card.index}
              className="hoc-card"
              type="button"
              role="gridcell"
              data-flipped={card.isFlipped ? 'true' : 'false'}
              data-matched={card.isMatched ? 'true' : 'false'}
              data-mismatch={card.isMismatch ? 'true' : 'false'}
              disabled={locked || card.isMatched || !humanCanPlay}
              onClick={() => handleCardClick(card.index)}
              aria-label={card.isFlipped || card.isMatched ? card.symbol : 'Hidden card'}
            >
              <span className="hoc-card-inner">
                <span className="hoc-card-face hoc-card-back">
                  <span className="hoc-card-back-pattern" />
                  <svg className="hoc-card-eye" viewBox="0 0 24 24" aria-hidden="true">
                    <ellipse cx="12" cy="12" rx="10" ry="6" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="1.2" className="hoc-card-eye-pupil" />
                  </svg>
                </span>
                <span className="hoc-card-face hoc-card-front">{card.symbol}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
