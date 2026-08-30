/**
 * ColorMatchComp — React minigame component for Color Match.
 *
 * Gameplay:
 *  - A brief "color mixing" animation transitions into the target color swatch.
 *  - The player adjusts R, G, B sliders to match the target color.
 *  - Live similarity % is hidden by default; buying a hint reveals it for that round.
 *  - Each hint also shows directional RGB guidance (too high / too low per channel).
 *  - The player can buy up to 2 hints total; each hint costs 5 points off the final average.
 *  - Each round has a time limit; missing it scores 0 for that round.
 *  - 5 rounds total. Final score = average accuracy across rounds − hint penalties (≤ 100).
 *  - Ties on final score break by total time taken (faster is better).
 *
 * Supports generic MinigameHost path: calls onFinish(finalScore, tiebreakerMs) when done.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { mulberry32 } from '../../store/rng';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import useSound from '../../hooks/useSound';
import {
  buildColorMatchCompetitionRawResults,
  type RGB,
  HINT_PENALTY_POINTS,
  applyHintPenalty,
  buildHintMessage,
  calculateColorMatchAccuracy,
  createColorMatchCompetitionStandings,
  formatColorMatchScore,
  getColorMatchAiRoundScore,
  getColorMatchFeedbackState,
  getColorMatchScoreDisplayPrecision,
  normalizeColorMatchCompetitionScore,
  randomStartColor,
  rankColorMatchCompetitionStandings,
  resolveColorMatchCompetitionRound,
  rgbToHex,
  seededPick,
  simulateColorMatchAiRoundScore,
  type ColorMatchCompetitionStanding,
} from './colorMatchUtils';
import './ColorMatchComp.css';

/** 'mixing' = pre-reveal color-mixing animation; 'playing' = active round */
type GamePhase = 'mixing' | 'playing' | 'feedback' | 'results';

interface RoundResult {
  score: number;
  targetColor: RGB;
  playerColor: RGB;
  hintCount: number;
  /** Time in ms the player spent actively adjusting sliders for this round. */
  roundElapsedMs: number;
}

interface PendingHintWarning {
  nextHintNumber: number;
}

const MAX_ROUNDS = 5;
const ROUND_TIME_S = 25;
const MAX_HINTS_TOTAL = 2;
const MIXING_DURATION_MS = 1600;
const DEFAULT_AI_FALLBACK_SCORE = 65;

const CLICK_SOUND_KEY = 'ui:navigate';
const CORRECT_SOUND_KEY = 'ui:confirm';
const INCORRECT_SOUND_KEY = 'ui:error';
const WINNER_SOUND_KEY = 'minigame:results';

function fmtOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

const NAMED_COLORS: Array<{ name: string; rgb: RGB }> = [
  { name: 'Scarlet', rgb: { r: 196, g: 30, b: 58 } },
  { name: 'Baby Blue', rgb: { r: 137, g: 207, b: 240 } },
  { name: 'Milky Grass', rgb: { r: 134, g: 187, b: 95 } },
  { name: 'Blood Orange', rgb: { r: 212, g: 81, b: 19 } },
  { name: 'Sky Cyan', rgb: { r: 55, g: 195, b: 220 } },
  { name: 'Lavender Mist', rgb: { r: 170, g: 140, b: 210 } },
  { name: 'Honey Gold', rgb: { r: 230, g: 170, b: 35 } },
  { name: 'Coral Reef', rgb: { r: 248, g: 131, b: 121 } },
  { name: 'Midnight Plum', rgb: { r: 88, g: 38, b: 110 } },
  { name: 'Sea Foam', rgb: { r: 78, g: 200, b: 175 } },
  { name: 'Dusty Rose', rgb: { r: 210, g: 145, b: 155 } },
  { name: 'Tangerine', rgb: { r: 242, g: 133, b: 0 } },
  { name: 'Steel Teal', rgb: { r: 42, g: 135, b: 145 } },
  { name: 'Amber Dusk', rgb: { r: 200, g: 120, b: 40 } },
  { name: 'Sage Whisper', rgb: { r: 150, g: 180, b: 140 } },
];

interface Props {
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null;
      rawValue?: number;
      rawResults?: Record<string, number>;
      tiebreakerMs?: number;
    },
  ) => void;
  seed?: number;
  autoStart?: boolean;
  participantIds?: string[];
  participants?: Array<{
    id: string;
    name: string;
    isHuman: boolean;
    precomputedScore: number;
    previousPR: number | null;
  }>;
}

export default function ColorMatchComp({
  onFinish,
  seed = 0,
  autoStart = false,
  participantIds = [],
  participants,
}: Props) {
  // Only use an explicitly non-zero prop seed (dev/test pages).
  // In normal hosted play MinigameHost omits the seed prop so ColorMatchComp
  // always generates a fresh crypto-random sequence per session — ensuring the
  // color order is unique each game and never a deterministic replay.
  const [sessionSeed] = useState<number>(() => {
    const s = seed !== 0 && seed !== undefined ? seed : cryptoSeed();
    if (import.meta.env.DEV) {
      console.log('COLOR_MATCH_INIT', { seedProp: seed, sessionSeed: s });
    }
    return s;
  });
  const { play } = useSound();
  const resolvedParticipants = useMemo(() => {
    if (participants && participants.length > 0) {
      return participants.map((participant, index) => ({
        ...participant,
        participantIndex: index,
      }));
    }
    return participantIds.map((id, index) => ({
      id,
      name: id,
      isHuman: index === 0,
      precomputedScore: 50,
      previousPR: null,
      participantIndex: index,
    }));
  }, [participantIds, participants]);
  const competitionMode = resolvedParticipants.length > 1;
  const humanParticipant = useMemo(
    () => resolvedParticipants.find((participant) => participant.isHuman) ?? null,
    [resolvedParticipants],
  );
  const humanId = humanParticipant?.id ?? null;
  const aiRoundScores = useMemo(
    () => Object.fromEntries(
      resolvedParticipants
        .filter((participant) => !participant.isHuman)
        .map((participant) => [
          participant.id,
          Array.from({ length: MAX_ROUNDS }, (_, roundIndex) => simulateColorMatchAiRoundScore(
            participant,
            roundIndex + 1,
            sessionSeed,
          )),
        ]),
    ) as Record<string, number[]>,
    [resolvedParticipants, sessionSeed],
  );
  const participantsById = useMemo(
    () => Object.fromEntries(resolvedParticipants.map((participant) => [participant.id, participant])),
    [resolvedParticipants],
  );

  const rounds = useMemo(() => {
    const rng = mulberry32((sessionSeed ^ 0x7f3da812) >>> 0);
    const picked = seededPick(NAMED_COLORS, NAMED_COLORS.length, rng);
    return picked.map((nc) => ({
      name: nc.name,
      target: { ...nc.rgb },
      startColor: randomStartColor(nc.rgb, rng),
    }));
  }, [sessionSeed]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('mixing');
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_S);
  const [playerColor, setPlayerColor] = useState<RGB>(rounds[0].startColor);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [hintWarning, setHintWarning] = useState<PendingHintWarning | null>(null);
  const [hintMessage, setHintMessage] = useState('');
  const [hintsUsedTotal, setHintsUsedTotal] = useState(0);
  const [hintsUsedThisRound, setHintsUsedThisRound] = useState(0);
  const [competitionStandings, setCompetitionStandings] = useState<ColorMatchCompetitionStanding[]>(() =>
    createColorMatchCompetitionStandings(resolvedParticipants),
  );
  const [roundEliminatedIds, setRoundEliminatedIds] = useState<string[]>([]);
  const [roundScoreboard, setRoundScoreboard] = useState<Array<{
    participantId: string;
    participantName: string;
    score: number;
    isHuman: boolean;
  }>>([]);
  /** Whether the accuracy % has been revealed for the current round (via hint). */
  const [accuracyRevealed, setAccuracyRevealed] = useState(false);
  /** Mixing colors shown in the pre-reveal animation blob */
  const [mixColors, setMixColors] = useState<[string, string, string]>(['#ff0000', '#00ff00', '#0000ff']);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const winnerPlayedRef = useRef(false);
  const mixingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundStartTimeRef = useRef<number>(Date.now());
  const totalElapsedMsRef = useRef<number>(0);

  // Refs for values used inside timer callback — prevents recreating submitRound
  // every time these change (which would cause the round-start effect to re-run).
  const hintsUsedThisRoundRef = useRef(0);
  const currentRoundTargetRef = useRef(rounds[0].target);

  const currentRound = rounds[roundIndex % rounds.length];
  const liveAccuracy = Math.round(calculateColorMatchAccuracy(currentRound.target, playerColor));
  const hintsRemaining = MAX_HINTS_TOTAL - hintsUsedTotal;
  const activeCompetitionStandings = useMemo(
    () => competitionStandings.filter((standing) => standing.eliminatedRound === null),
    [competitionStandings],
  );
  const humanStanding = useMemo(
    () => (humanId ? competitionStandings.find((standing) => standing.participantId === humanId) ?? null : null),
    [competitionStandings, humanId],
  );
  const humanStillActive = humanStanding?.eliminatedRound === null;

  // Keep refs in sync with latest values.
  useEffect(() => { hintsUsedThisRoundRef.current = hintsUsedThisRound; }, [hintsUsedThisRound]);
  useEffect(() => { currentRoundTargetRef.current = currentRound.target; }, [currentRound.target]);

  const playClick = useCallback(() => play(CLICK_SOUND_KEY), [play]);
  const playCorrect = useCallback(() => play(CORRECT_SOUND_KEY), [play]);
  const playIncorrect = useCallback(() => play(INCORRECT_SOUND_KEY), [play]);
  const playWinner = useCallback(() => play(WINNER_SOUND_KEY), [play]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // submitRound no longer depends on hintsUsedThisRound (uses ref instead),
  // which breaks the cycle: buying hint → state update → submitRound recreated
  // → round-start effect re-runs → hint cleared.
  const submitRound = useCallback(
    (color: RGB, didTimeOut: boolean) => {
      stopTimer();
      const target = currentRoundTargetRef.current;
      const rawScore = didTimeOut ? 0 : calculateColorMatchAccuracy(target, color);
      const score = competitionMode
        ? normalizeColorMatchCompetitionScore(rawScore - hintsUsedThisRoundRef.current * HINT_PENALTY_POINTS)
        : Math.round(rawScore);
      if (didTimeOut || score < 80) {
        playIncorrect();
      } else {
        playCorrect();
      }
      const roundElapsedMs = Date.now() - roundStartTimeRef.current;
      totalElapsedMsRef.current += roundElapsedMs;
      setLastScore(score);
      setTimedOut(didTimeOut);
      setResults((prev) => [
        ...prev,
        {
          score,
          targetColor: target,
          playerColor: color,
          hintCount: hintsUsedThisRoundRef.current,
          roundElapsedMs,
        },
      ]);
      if (competitionMode) {
        const roundNumber = roundIndex + 1;
        const roundScoresById = Object.fromEntries(activeCompetitionStandings.map((standing) => [
          standing.participantId,
          standing.isHuman
            ? score
            : (() => {
              const participant = participantsById[standing.participantId];
              return participant
                ? getColorMatchAiRoundScore(
                  participant,
                  roundNumber,
                  sessionSeed,
                  aiRoundScores[standing.participantId],
                )
                : DEFAULT_AI_FALLBACK_SCORE;
            })(),
        ]));
        const resolvedRound = resolveColorMatchCompetitionRound(
          competitionStandings,
          roundNumber,
          roundScoresById,
        );
        setCompetitionStandings(resolvedRound.standings);
        setRoundEliminatedIds(resolvedRound.eliminatedIds);
        setRoundScoreboard(
          activeCompetitionStandings
            .map((standing) => ({
              participantId: standing.participantId,
              participantName: standing.participantName,
              score: roundScoresById[standing.participantId] ?? 0,
              isHuman: standing.isHuman,
            }))
            .sort((a, b) => b.score - a.score || a.participantName.localeCompare(b.participantName)),
        );
      } else {
        setRoundEliminatedIds([]);
        setRoundScoreboard([]);
      }
      setPhase('feedback');
    },
    [activeCompetitionStandings, aiRoundScores, competitionMode, competitionStandings, participantsById, playCorrect, playIncorrect, roundIndex, sessionSeed, stopTimer],
  );

  // Keep submitRound available via ref so the interval can always call the latest.
  const submitRoundRef = useRef(submitRound);
  useEffect(() => { submitRoundRef.current = submitRound; }, [submitRound]);

  // ── Pre-reveal mixing animation ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'mixing') return;
    const t = currentRound.target;
    // Generate two "component" colors from the target to make a plausible mix preview.
    const c1 = rgbToHex({ r: Math.min(255, t.r + 60), g: Math.max(0, t.g - 40), b: Math.max(0, t.b - 30) });
    const c2 = rgbToHex({ r: Math.max(0, t.r - 50), g: Math.min(255, t.g + 50), b: Math.min(255, t.b + 40) });
    const c3 = rgbToHex({ r: Math.max(0, t.r - 20), g: Math.max(0, t.g - 20), b: Math.min(255, t.b + 80) });
    setMixColors([c1, c2, c3]);
    mixingTimeoutRef.current = setTimeout(() => {
      setPhase('playing');
    }, MIXING_DURATION_MS);
    return () => {
      if (mixingTimeoutRef.current) clearTimeout(mixingTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roundIndex]);

  // ── Round timer ──────────────────────────────────────────────────────────────
  // Note: submitRound is intentionally absent from deps — we use the ref instead.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (competitionMode && !humanStillActive) return;
    setTimeLeft(ROUND_TIME_S);
    setHintMessage('');
    setHintsUsedThisRound(0);
    hintsUsedThisRoundRef.current = 0;
    setAccuracyRevealed(false);
    roundStartTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPlayerColor((pc) => {
            submitRoundRef.current(pc, true);
            return pc;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return stopTimer;
  }, [competitionMode, humanStillActive, phase, roundIndex, stopTimer]);

  useEffect(() => {
    setPlayerColor(rounds[roundIndex % rounds.length].startColor);
  }, [roundIndex, rounds]);

  useEffect(() => {
    if (phase !== 'results' || winnerPlayedRef.current) return;
    winnerPlayedRef.current = true;
    playWinner();
    const tiebreakerMs = totalElapsedMsRef.current;
    const timeoutId = setTimeout(() => {
      if (!onFinish) return;
      if (competitionMode) {
        const ranked = rankColorMatchCompetitionStandings(competitionStandings);
        const rawResults = buildColorMatchCompetitionRawResults(ranked);
        const winner = ranked[0];
        const humanOrWinnerScore = rawResults[humanId ?? ''] ?? rawResults[winner?.participantId ?? ''] ?? 0;
        onFinish(humanOrWinnerScore, tiebreakerMs, {
          authoritativeWinnerId: winner?.participantId ?? null,
          rawValue: humanOrWinnerScore,
          rawResults,
        });
        return;
      }
      const total = results.reduce((sum, r) => sum + r.score, 0);
      const rawAverage = Math.round(total / results.length);
      const finalScore = applyHintPenalty(rawAverage, hintsUsedTotal);
      onFinish(finalScore, tiebreakerMs);
    }, autoStart ? 0 : 2000);
    return () => clearTimeout(timeoutId);
  }, [autoStart, competitionMode, competitionStandings, hintsUsedTotal, humanId, onFinish, phase, playWinner, results]);

  useEffect(() => {
    if (!competitionMode || phase !== 'playing' || humanStillActive) return;
    const timeoutId = setTimeout(() => {
      const roundNumber = roundIndex + 1;
      const roundScoresById = Object.fromEntries(
        activeCompetitionStandings.map((standing) => [
          standing.participantId,
          (() => {
            const participant = participantsById[standing.participantId];
            return participant
              ? getColorMatchAiRoundScore(
                participant,
                roundNumber,
                sessionSeed,
                aiRoundScores[standing.participantId],
              )
              : DEFAULT_AI_FALLBACK_SCORE;
          })(),
        ]),
      );
      const resolvedRound = resolveColorMatchCompetitionRound(
        competitionStandings,
        roundNumber,
        roundScoresById,
      );
      setTimedOut(false);
      setLastScore(null);
      setCompetitionStandings(resolvedRound.standings);
      setRoundEliminatedIds(resolvedRound.eliminatedIds);
      setRoundScoreboard(
        activeCompetitionStandings
          .map((standing) => ({
            participantId: standing.participantId,
            participantName: standing.participantName,
            score: roundScoresById[standing.participantId] ?? 0,
            isHuman: standing.isHuman,
          }))
          .sort((a, b) => b.score - a.score || a.participantName.localeCompare(b.participantName)),
      );
      setPhase('feedback');
    }, 600);
    return () => clearTimeout(timeoutId);
  }, [activeCompetitionStandings, aiRoundScores, competitionMode, competitionStandings, humanStillActive, participantsById, phase, roundIndex, sessionSeed]);

  const handleSliderChange = useCallback(
    (channel: keyof RGB, value: number) => {
      if (phase !== 'playing') return;
      setPlayerColor((prev) => ({ ...prev, [channel]: value }));
    },
    [phase],
  );

  const handleSubmit = useCallback(() => {
    if (phase !== 'playing') return;
    playClick();
    setPlayerColor((pc) => {
      submitRoundRef.current(pc, false);
      return pc;
    });
  }, [phase, playClick]);

  const nextIndex = roundIndex + 1;
  const feedbackState = getColorMatchFeedbackState({
    competitionMode,
    humanStillActive,
    activeCompetitionCount: activeCompetitionStandings.length,
    nextIndex,
    maxRounds: MAX_ROUNDS,
  });
  const { competitionOver, ctaLabel: feedbackCtaLabel } = feedbackState;

  const skipToResults = useCallback(() => {
    if (!competitionMode || humanStillActive || competitionOver) return;
    let standings = competitionStandings;
    for (let nextRound = roundIndex + 2; nextRound <= MAX_ROUNDS; nextRound += 1) {
      const scores = Object.fromEntries(standings
        .filter((standing) => standing.eliminatedRound === null)
        .map((standing) => [standing.participantId, aiRoundScores[standing.participantId]?.[nextRound - 1] ?? DEFAULT_AI_FALLBACK_SCORE]));
      standings = resolveColorMatchCompetitionRound(standings, nextRound, scores).standings;
    }
    setCompetitionStandings(standings);
    setPhase('results');
  }, [aiRoundScores, competitionMode, competitionOver, competitionStandings, humanStillActive, roundIndex]);

  const handleNext = useCallback(() => {
    playClick();
    if (competitionOver) {
      setPhase('results');
    } else {
      setRoundScoreboard([]);
      setRoundEliminatedIds([]);
      setRoundIndex(nextIndex);
      setPhase('mixing');
    }
  }, [competitionOver, nextIndex, playClick]);

  const handleHintPress = useCallback(() => {
    if (phase !== 'playing' || hintsRemaining <= 0) return;
    playClick();
    setHintWarning({ nextHintNumber: hintsUsedTotal + 1 });
  }, [hintsRemaining, hintsUsedTotal, phase, playClick]);

  const confirmHintPurchase = useCallback(() => {
    if (!hintWarning || phase !== 'playing' || hintsRemaining <= 0) return;
    playClick();
    setHintsUsedTotal((prev) => prev + 1);
    setHintsUsedThisRound((prev) => {
      const next = prev + 1;
      hintsUsedThisRoundRef.current = next;
      return next;
    });
    setAccuracyRevealed(true);
    setHintMessage(buildHintMessage(currentRound.target, playerColor));
    setHintWarning(null);
  }, [currentRound.target, hintWarning, hintsRemaining, phase, playClick, playerColor]);

  const cancelHintPurchase = useCallback(() => {
    playClick();
    setHintWarning(null);
  }, [playClick]);

  const targetHex = rgbToHex(currentRound.target);
  const playerHex = rgbToHex(playerColor);
  const progressPct = (timeLeft / ROUND_TIME_S) * 100;
  const isUrgent = timeLeft <= 5;
  const rematchNumber = roundIndex - MAX_ROUNDS + 1;
  const roundLabelContent = roundIndex < MAX_ROUNDS
    ? <>Round <strong>{roundIndex + 1}</strong>/{MAX_ROUNDS}</>
    : <>Final Rematch <strong>{rematchNumber}</strong></>;

  const feedbackLabel =
    lastScore !== null
      ? lastScore >= 95
        ? '🎯 Perfect!'
        : lastScore >= 80
          ? '✅ Great!'
          : lastScore >= 60
            ? '👍 Good'
            : lastScore >= 40
              ? '😬 Close-ish'
              : '❌ Way off'
      : '';
  const rankedCompetitionStandings = useMemo(
    () => (competitionMode ? rankColorMatchCompetitionStandings(competitionStandings) : []),
    [competitionMode, competitionStandings],
  );
  const roundScorePrecision = useMemo(
    () => getColorMatchScoreDisplayPrecision(roundScoreboard.map((entry) => entry.score)),
    [roundScoreboard],
  );
  const rankedScorePrecision = useMemo(
    () => getColorMatchScoreDisplayPrecision(
      rankedCompetitionStandings
        .map((standing) => standing.roundScores[standing.roundScores.length - 1])
        .filter((score): score is number => typeof score === 'number'),
    ),
    [rankedCompetitionStandings],
  );
  const competitionWinner = rankedCompetitionStandings[0] ?? null;
  const humanPlacement = humanId
    ? rankedCompetitionStandings.findIndex((standing) => standing.participantId === humanId) + 1
    : 0;
  const feedbackScoreText = lastScore === null
    ? ''
    : competitionMode
      ? formatColorMatchScore(lastScore, roundScorePrecision)
      : `${Math.round(lastScore)}%`;

  // ── Results screen ───────────────────────────────────────────────────────────
  if (phase === 'results') {
    if (competitionMode) {
      return (
        <div className="cm" data-testid="color-match-comp">
          <div className="cm__card cm__card--results">
            <div className="cm__title">🎨 Color Match</div>
            <div className="cm__subtitle">Competition Results</div>
            <div className="cm__final-score">{competitionWinner ? `${competitionWinner.participantName}` : 'No Winner'}</div>
            <p className="cm__final-label">
              {humanPlacement > 0 ? `You finished ${fmtOrdinal(humanPlacement)}.` : 'Closest match in the finale wins.'}
            </p>
            <div className="cm__summary-grid">
              <div className="cm__summary-chip">
                <span className="cm__summary-label">Finalists</span>
                <strong>{activeCompetitionStandings.length}</strong>
              </div>
              <div className="cm__summary-chip">
                <span className="cm__summary-label">Hints Used</span>
                <strong>{hintsUsedTotal}</strong>
              </div>
              <div className="cm__summary-chip">
                <span className="cm__summary-label">Time</span>
                <strong>{(totalElapsedMsRef.current / 1000).toFixed(1)}s</strong>
              </div>
            </div>
            <ol className="cm__round-list">
              {rankedCompetitionStandings.map((standing, index) => (
                <li key={standing.participantId} className="cm__round-item">
                  <span className="cm__round-num">{fmtOrdinal(index + 1)}</span>
                  <span className="cm__round-swatch" style={{ background: index === 0 ? '#f7c948' : '#334155' }} />
                  <span>{standing.participantName}{standing.isHuman ? ' (You)' : ''}</span>
                  <span className="cm__round-score">
                    {standing.eliminatedRound === null
                      ? `${formatColorMatchScore(
                        standing.roundScores[standing.roundScores.length - 1] ?? 0,
                        rankedScorePrecision,
                      )} finale`
                      : `Out in R${standing.eliminatedRound}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    }
    const total = results.reduce((sum, r) => sum + r.score, 0);
    const rawAverage = Math.round(total / results.length);
    const finalScore = applyHintPenalty(rawAverage, hintsUsedTotal);
    const totalSecs = (totalElapsedMsRef.current / 1000).toFixed(1);
    return (
      <div className="cm" data-testid="color-match-comp">
        <div className="cm__card cm__card--results">
          <div className="cm__title">🎨 Color Match</div>
          <div className="cm__subtitle">Final Results</div>
          <div className="cm__final-score">{finalScore}<span className="cm__final-unit">%</span></div>
          <p className="cm__final-label">Final Accuracy After Hint Penalties</p>
          <div className="cm__summary-grid">
            <div className="cm__summary-chip">
              <span className="cm__summary-label">Raw Avg</span>
              <strong>{rawAverage}%</strong>
            </div>
            <div className="cm__summary-chip">
              <span className="cm__summary-label">Time</span>
              <strong>{totalSecs}s</strong>
            </div>
            <div className="cm__summary-chip cm__summary-chip--penalty">
              <span className="cm__summary-label">Hint Penalty</span>
              <strong>-{hintsUsedTotal * HINT_PENALTY_POINTS}%</strong>
            </div>
          </div>
          <ol className="cm__round-list">
            {results.map((r, i) => (
              <li key={i} className="cm__round-item">
                <span className="cm__round-num">Round {i + 1}</span>
                <span className="cm__round-swatch" style={{ background: rgbToHex(r.targetColor) }} title={rounds[i].name} />
                <span className="cm__round-swatch" style={{ background: rgbToHex(r.playerColor) }} title="Your color" />
                {r.hintCount > 0 && <span className="cm__round-hints">💡×{r.hintCount}</span>}
                <span className={[
                  'cm__round-score',
                  r.score >= 80 ? 'cm__round-score--great' : r.score >= 50 ? 'cm__round-score--ok' : 'cm__round-score--poor',
                ].join(' ')}>
                  {r.score}%
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  // ── Mixing animation screen ──────────────────────────────────────────────────
  if (phase === 'mixing') {
    return (
      <div className="cm" data-testid="color-match-comp">
        <div className="cm__card">
          <header className="cm__header">
            <span className="cm__round-label">{roundLabelContent}</span>
            <span className="cm__timer" />
          </header>
          <div className="cm__mixing-stage" aria-label="Color mixing animation">
            <div className="cm__mixing-label">Mixing your color…</div>
            <div className="cm__mixing-blobs">
              <div className="cm__mix-blob cm__mix-blob--1" style={{ background: mixColors[0] }} />
              <div className="cm__mix-blob cm__mix-blob--2" style={{ background: mixColors[1] }} />
              <div className="cm__mix-blob cm__mix-blob--3" style={{ background: mixColors[2] }} />
              <div className="cm__mix-blob cm__mix-blob--reveal" style={{ background: targetHex }} />
            </div>
            <div className="cm__mixing-name">{currentRound.name}</div>
            {competitionMode && (
              <div className="cm__mixing-name">
                {humanStillActive ? `${activeCompetitionStandings.length} players remain` : 'Spectating remaining players'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Playing / feedback screen ────────────────────────────────────────────────
  return (
    <div className="cm" data-testid="color-match-comp">
      <div className="cm__card">
        <header className="cm__header">
          <span className="cm__round-label">{roundLabelContent}</span>
          <span className={['cm__timer', isUrgent ? 'cm__timer--urgent' : ''].filter(Boolean).join(' ')} aria-live={isUrgent ? 'assertive' : 'off'} aria-atomic="true">
            {timeLeft}s
          </span>
        </header>

        <div className="cm__timer-bar" role="progressbar" aria-valuenow={timeLeft} aria-valuemin={0} aria-valuemax={ROUND_TIME_S}>
          <div className={['cm__timer-fill', isUrgent ? 'cm__timer-fill--urgent' : ''].filter(Boolean).join(' ')} style={{ width: `${progressPct}%` }} />
        </div>

        <div className="cm__color-name" aria-label="Target color name">{currentRound.name}</div>

        <div className="cm__meta-row">
          <div className="cm__hint-stock">💡 {hintsRemaining} hint{hintsRemaining === 1 ? '' : 's'} left</div>
          <div className="cm__penalty-chip">
            {competitionMode
              ? `${activeCompetitionStandings.length} players remain`
              : `-${hintsUsedTotal * HINT_PENALTY_POINTS}% final score`}
          </div>
        </div>

        <div className="cm__swatches">
          <div className="cm__swatch-col">
            <div className="cm__swatch cm__swatch--target" style={{ background: targetHex }} aria-label={`Target: ${currentRound.name}`} />
            <span className="cm__swatch-label">Target</span>
          </div>
          <div className="cm__accuracy-meter" aria-live="polite" aria-atomic="true">
            {accuracyRevealed ? (
              <>
                <span className={[
                  'cm__accuracy-val',
                  liveAccuracy >= 80 ? 'cm__accuracy-val--great' : liveAccuracy >= 50 ? 'cm__accuracy-val--ok' : 'cm__accuracy-val--poor',
                ].join(' ')}>
                  {phase === 'playing' ? liveAccuracy : (lastScore ?? liveAccuracy)}%
                </span>
                <span className="cm__accuracy-sub">match</span>
              </>
            ) : (
              <>
                <span className="cm__accuracy-val cm__accuracy-val--hidden">?</span>
                <span className="cm__accuracy-sub">buy hint to reveal</span>
              </>
            )}
          </div>
          <div className="cm__swatch-col">
            <div className="cm__swatch cm__swatch--player" style={{ background: playerHex }} aria-label="Your color" />
            <span className="cm__swatch-label">Yours</span>
          </div>
        </div>

        {hintMessage && phase === 'playing' && (
          <div className="cm__hint-panel" aria-live="polite" data-testid="hint-panel">
            <div className="cm__hint-panel-title">💡 Hint {hintsUsedThisRound}</div>
            <div className="cm__hint-panel-body">{hintMessage}</div>
          </div>
        )}

        {phase === 'feedback' && (
          <div className="cm__feedback" aria-live="assertive">
            {timedOut ? (
              <span className="cm__feedback-text cm__feedback-text--timeout">⏱ Time's up! +0</span>
            ) : (
              <span className="cm__feedback-text">{feedbackLabel} — {feedbackScoreText}</span>
            )}
          </div>
        )}

        {(!competitionMode || humanStillActive) && (
          <div className="cm__sliders" aria-label="RGB color controls">
          {(['r', 'g', 'b'] as const).map((ch) => {
            const labels: Record<typeof ch, string> = { r: 'Red', g: 'Green', b: 'Blue' };
            return (
              <div key={ch} className={`cm__slider-row cm__slider-row--${ch}`}>
                <label className="cm__slider-label" htmlFor={`cm-slider-${ch}`}>
                  {labels[ch]}
                  <span className="cm__slider-val">{playerColor[ch]}</span>
                </label>
                <input
                  id={`cm-slider-${ch}`}
                  type="range"
                  min={0}
                  max={255}
                  value={playerColor[ch]}
                  onChange={(e) => handleSliderChange(ch, Number(e.target.value))}
                  disabled={phase !== 'playing'}
                  className="cm__slider"
                  aria-label={`${labels[ch]} channel: ${playerColor[ch]}`}
                />
              </div>
            );
          })}
          </div>
        )}

        {competitionMode && phase === 'feedback' && roundScoreboard.length > 0 && (
          <div className="cm__hint-panel" aria-live="polite">
            <div className="cm__hint-panel-title">
              Round {roundIndex + 1} standings
              {roundEliminatedIds.length > 0 ? ` — ${roundEliminatedIds.length} eliminated` : ''}
            </div>
            <div className="cm__hint-panel-body">
              {roundScoreboard.map((entry) => (
                <div key={entry.participantId}>
                  {entry.participantName}{entry.isHuman ? ' (You)' : ''}: {formatColorMatchScore(entry.score, roundScorePrecision)}
                  {roundEliminatedIds.includes(entry.participantId) ? ' — eliminated' : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'playing' && (!competitionMode || humanStillActive) && (
          <div className="cm__action-row">
            <button className="cm__btn cm__btn--hint" onClick={handleHintPress} type="button" disabled={hintsRemaining <= 0}>
              Buy Hint (-5%)
            </button>
            <button className="cm__btn cm__btn--submit" onClick={handleSubmit} type="button">
              Submit Match
            </button>
          </div>
        )}
        {phase === 'playing' && competitionMode && !humanStillActive && (
          <div className="cm__feedback" aria-live="polite">
            <span className="cm__feedback-text">You were eliminated. Resolving the rest of the round…</span>
          </div>
        )}
        {phase === 'feedback' && (
            <button className="cm__btn cm__btn--next" onClick={handleNext} type="button" autoFocus>
            {feedbackCtaLabel}
          </button>
        )}
        {competitionMode && phase === 'feedback' && !humanStillActive && !competitionOver && (
          <button className="cm__btn cm__btn--next cm__btn--secondary" onClick={skipToResults} type="button">
            Skip to Results
          </button>
        )}
      </div>

      {hintWarning && (
        <div className="cm__modal-backdrop" role="presentation">
          <div className="cm__modal" role="dialog" aria-modal="true" aria-label="Hint purchase warning">
            <h3 className="cm__modal-title">Buy Hint {hintWarning.nextHintNumber}?</h3>
            <p className="cm__modal-copy">
              This hint will reduce your {competitionMode ? 'round score' : 'final score'} by <strong>{HINT_PENALTY_POINTS}%</strong>.
              It will also <strong>reveal your % match</strong> for this round.
            </p>
            <p className="cm__modal-copy cm__modal-copy--muted">
              You can use both hints in one round or save one for later.
            </p>
            <div className="cm__modal-actions">
              <button className="cm__btn cm__btn--ghost" type="button" onClick={cancelHintPurchase}>Cancel</button>
              <button className="cm__btn cm__btn--hint" type="button" onClick={confirmHintPurchase}>Buy Hint</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
