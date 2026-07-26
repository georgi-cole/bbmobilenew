import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createHouseOfCardsAiProfiles, simulateHouseOfCardsAiRound } from '../../features/houseOfCards/houseOfCardsAi';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { useHouseOfCardsAudio } from '../../hooks/useHouseOfCardsAudio';
import { SoundManager } from '../../services/sound/SoundManager';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import {
  HOUSE_OF_DARKNESS_COLUMNS,
  HOUSE_OF_DARKNESS_MAX_ROUNDS,
  HOUSE_OF_DARKNESS_STARTING_HEALTH,
  applyHouseOfDarknessMistakes,
  buildHouseOfDarknessBoard,
  formatHouseOfDarknessHealth,
  getHouseOfDarknessMistakeDamage,
  getHouseOfDarknessPairCount,
  recoverHouseOfDarknessHealth,
  type HouseOfDarknessCard,
} from './houseOfDarknessUtils';
import './HouseOfDarknessComp.css';

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
  avatar?: string;
  precomputedScore?: number;
  previousPR?: number | null;
}

interface CompletionPayload {
  authoritativeWinnerId?: string | null;
  rawValue?: number;
  rawResults?: Record<string, number>;
  tiebreakerMs?: number;
}

interface Props {
  participantIds?: string[];
  participants?: ParticipantProp[];
  seed?: number;
  autoStart?: boolean;
  onFinish?: (value: number, tiebreakerMs?: number, completion?: CompletionPayload) => void;
}

type Phase = 'playing' | 'round_results' | 'death' | 'results';

type BoardStyle = CSSProperties & { '--hod-columns': number };
type HealthStyle = CSSProperties & { '--hod-health': string };

interface ContestantState {
  id: string;
  health: number;
  alive: boolean;
  eliminatedRound: number | null;
  completedRounds: number;
  totalMistakes: number;
  totalDamage: number;
  totalTimeMs: number;
}

interface RoundResult {
  id: string;
  startingHealth: number;
  healthAfterDamage: number;
  endingHealth: number;
  damage: number;
  recovered: number;
  mistakes: number;
  timeMs: number;
  died: boolean;
}

interface RoundSummary {
  round: number;
  results: RoundResult[];
}

function clampHealth(value: number): number {
  return Math.max(0, Math.min(HOUSE_OF_DARKNESS_STARTING_HEALTH, Math.round(value * 10) / 10));
}

function buildInitialContestants(ids: string[]): Record<string, ContestantState> {
  return Object.fromEntries(ids.map((id) => [id, {
    id,
    health: HOUSE_OF_DARKNESS_STARTING_HEALTH,
    alive: true,
    eliminatedRound: null,
    completedRounds: 0,
    totalMistakes: 0,
    totalDamage: 0,
    totalTimeMs: 0,
  }]));
}

function rankContestants(
  states: Record<string, ContestantState>,
  participantOrder: string[],
): ContestantState[] {
  return Object.values(states).sort((first, second) => {
    if (first.alive !== second.alive) return first.alive ? -1 : 1;
    if (first.completedRounds !== second.completedRounds) return second.completedRounds - first.completedRounds;
    if (first.health !== second.health) return second.health - first.health;
    if (first.totalDamage !== second.totalDamage) return first.totalDamage - second.totalDamage;
    if (first.totalMistakes !== second.totalMistakes) return first.totalMistakes - second.totalMistakes;
    if (first.totalTimeMs !== second.totalTimeMs) return first.totalTimeMs - second.totalTimeMs;
    return participantOrder.indexOf(first.id) - participantOrder.indexOf(second.id);
  });
}

function rawScoreFor(state: ContestantState): number {
  return Math.max(
    0,
    Math.round(
      (state.alive ? 1_000_000 : 0)
      + state.completedRounds * 10_000
      + state.health * 100
      - state.totalDamage * 10
      - state.totalMistakes,
    ),
  );
}

export default function HouseOfDarknessComp({
  participantIds = [],
  participants,
  seed,
  onFinish,
}: Props) {
  const resolvedIds = useMemo(() => {
    if (participantIds.length > 0) return participantIds;
    const participantList = participants?.map((participant) => participant.id) ?? [];
    return participantList.length > 0 ? participantList : ['human'];
  }, [participantIds, participants]);
  const humanId = useMemo(
    () => participants?.find((participant) => participant.isHuman)?.id ?? resolvedIds[0],
    [participants, resolvedIds],
  );
  const nameFor = useCallback(
    (id: string) => participants?.find((participant) => participant.id === id)?.name ?? id,
    [participants],
  );
  const [sessionSeed] = useState(() => seed || cryptoSeed());
  const aiProfiles = useMemo(
    () => createHouseOfCardsAiProfiles(resolvedIds, humanId, sessionSeed),
    [humanId, resolvedIds, sessionSeed],
  );

  const [phase, setPhase] = useState<Phase>('playing');
  const [round, setRound] = useState(1);
  const [contestants, setContestants] = useState<Record<string, ContestantState>>(
    () => buildInitialContestants(resolvedIds),
  );
  const [board, setBoard] = useState<HouseOfDarknessCard[]>(
    () => buildHouseOfDarknessBoard(sessionSeed, getHouseOfDarknessPairCount(1)),
  );
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [roundMistakes, setRoundMistakes] = useState(0);
  const [roundDamage, setRoundDamage] = useState(0);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [standings, setStandings] = useState<ContestantState[]>([]);
  const [damageFlash, setDamageFlash] = useState<number | null>(null);

  const roundStartedAtRef = useRef(Date.now());
  const roundStartingHealthRef = useRef(HOUSE_OF_DARKNESS_STARTING_HEALTH);
  const roundCompletedRef = useRef(false);
  const deathResolvedRef = useRef(false);
  const contestantsRef = useRef(contestants);
  contestantsRef.current = contestants;

  const pairCount = getHouseOfDarknessPairCount(round);
  const playableCards = pairCount * 2;
  const boardStyle: BoardStyle = { '--hod-columns': HOUSE_OF_DARKNESS_COLUMNS };
  const humanState = contestants[humanId];
  const humanHealth = humanState?.health ?? 0;
  const { playFlip, playMatch, playMismatch, playComplete } = useHouseOfCardsAudio(phase === 'playing');

  const finalizeTournament = useCallback((nextStates: Record<string, ContestantState>) => {
    const ranked = rankContestants(nextStates, resolvedIds);
    setContestants(nextStates);
    setStandings(ranked);
    setPhase('results');
    playComplete();
  }, [playComplete, resolvedIds]);

  const simulateAiRound = useCallback((
    player: ContestantState,
    simulatedRound: number,
  ): { next: ContestantState; result: RoundResult } => {
    const simulatedPairCount = getHouseOfDarknessPairCount(simulatedRound);
    const performance = simulateHouseOfCardsAiRound({
      playerId: player.id,
      round: simulatedRound,
      pairCount: simulatedPairCount,
      tournamentSeed: sessionSeed,
      sessionAbility: aiProfiles[player.id]?.sessionAbility ?? 55,
    });
    const damageResolution = applyHouseOfDarknessMistakes({
      health: player.health,
      sessionSeed,
      playerId: player.id,
      round: simulatedRound,
      mistakeStartIndex: 0,
      mistakeCount: performance.mistakes,
    });
    const completedBoard = damageResolution.lethalMistakeIndex === null;
    const endingHealth = recoverHouseOfDarknessHealth(
      damageResolution.health,
      damageResolution.damage,
      completedBoard,
    );
    const alive = completedBoard && endingHealth > 0;
    const next: ContestantState = {
      ...player,
      health: endingHealth,
      alive,
      eliminatedRound: alive ? null : simulatedRound,
      completedRounds: player.completedRounds + (completedBoard ? 1 : 0),
      totalMistakes: player.totalMistakes + performance.mistakes,
      totalDamage: player.totalDamage + damageResolution.damage,
      totalTimeMs: player.totalTimeMs + performance.timeMs,
    };
    return {
      next,
      result: {
        id: player.id,
        startingHealth: player.health,
        healthAfterDamage: damageResolution.health,
        endingHealth,
        damage: damageResolution.damage,
        recovered: Math.max(0, Math.round((endingHealth - damageResolution.health) * 10) / 10),
        mistakes: performance.mistakes,
        timeMs: performance.timeMs,
        died: !alive,
      },
    };
  }, [aiProfiles, sessionSeed]);

  const simulateAfterHumanDeath = useCallback((startingStates: Record<string, ContestantState>) => {
    let nextStates = { ...startingStates };

    for (let simulatedRound = round; simulatedRound <= HOUSE_OF_DARKNESS_MAX_ROUNDS; simulatedRound += 1) {
      const livingAiIds = resolvedIds.filter((id) => id !== humanId && nextStates[id]?.alive);
      if (livingAiIds.length <= 1) break;

      livingAiIds.forEach((id) => {
        const resolution = simulateAiRound(nextStates[id], simulatedRound);
        nextStates = { ...nextStates, [id]: resolution.next };
      });

      const survivors = resolvedIds.filter((id) => nextStates[id]?.alive);
      if (survivors.length <= 1) break;
    }

    finalizeTournament(nextStates);
  }, [finalizeTournament, humanId, resolvedIds, round, simulateAiRound]);

  useEffect(() => {
    if (phase !== 'death' || deathResolvedRef.current) return;
    deathResolvedRef.current = true;
    void SoundManager.play('minigame:risk_wheel_666');
    const screamTimer = window.setTimeout(() => {
      void SoundManager.play('player:evicted');
    }, 120);
    const resolveTimer = window.setTimeout(() => {
      simulateAfterHumanDeath(contestantsRef.current);
    }, 2600);
    return () => {
      window.clearTimeout(screamTimer);
      window.clearTimeout(resolveTimer);
    };
  }, [phase, simulateAfterHumanDeath]);

  const showDamageFlash = useCallback((damage: number) => {
    setDamageFlash(damage);
    window.setTimeout(() => setDamageFlash(null), 540);
  }, []);

  const finishRound = useCallback(() => {
    if (roundCompletedRef.current || phase !== 'playing') return;
    roundCompletedRef.current = true;

    const currentStates = contestantsRef.current;
    const currentHuman = currentStates[humanId];
    if (!currentHuman?.alive) return;

    const elapsedMs = Math.max(1, Date.now() - roundStartedAtRef.current);
    const healedHumanHealth = recoverHouseOfDarknessHealth(
      currentHuman.health,
      roundDamage,
      true,
    );
    const humanNext: ContestantState = {
      ...currentHuman,
      health: healedHumanHealth,
      completedRounds: currentHuman.completedRounds + 1,
      totalTimeMs: currentHuman.totalTimeMs + elapsedMs,
    };
    let nextStates: Record<string, ContestantState> = {
      ...currentStates,
      [humanId]: humanNext,
    };
    const results: RoundResult[] = [{
      id: humanId,
      startingHealth: roundStartingHealthRef.current,
      healthAfterDamage: currentHuman.health,
      endingHealth: healedHumanHealth,
      damage: roundDamage,
      recovered: Math.max(0, Math.round((healedHumanHealth - currentHuman.health) * 10) / 10),
      mistakes: roundMistakes,
      timeMs: elapsedMs,
      died: false,
    }];

    resolvedIds.forEach((id) => {
      if (id === humanId) return;
      const player = nextStates[id];
      if (!player?.alive) return;
      const resolution = simulateAiRound(player, round);
      nextStates = { ...nextStates, [id]: resolution.next };
      results.push(resolution.result);
    });

    const livingIds = resolvedIds.filter((id) => nextStates[id]?.alive);
    if (livingIds.length <= 1 || round >= HOUSE_OF_DARKNESS_MAX_ROUNDS) {
      finalizeTournament(nextStates);
      return;
    }

    setContestants(nextStates);
    setRoundSummary({ round, results });
    setPhase('round_results');
  }, [finalizeTournament, humanId, phase, resolvedIds, round, roundDamage, roundMistakes, simulateAiRound]);

  useEffect(() => {
    if (phase === 'playing' && matchedPairs >= pairCount) finishRound();
  }, [finishRound, matchedPairs, pairCount, phase]);

  const resolvePair = useCallback((firstIndex: number, secondIndex: number) => {
    const first = board[firstIndex];
    const second = board[secondIndex];
    if (!first || !second || first.isPlaceholder || second.isPlaceholder) return;
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
      window.setTimeout(() => setLocked(false), 260);
      return;
    }

    playMismatch();
    const hit = getHouseOfDarknessMistakeDamage(
      sessionSeed,
      humanId,
      round,
      roundMistakes,
    );
    showDamageFlash(hit);
    setRoundMistakes((value) => value + 1);
    setRoundDamage((value) => value + hit);
    let lethal = false;
    setContestants((current) => {
      const player = current[humanId];
      if (!player) return current;
      const nextHealth = clampHealth(player.health - hit);
      lethal = nextHealth <= 0;
      const next = {
        ...current,
        [humanId]: {
          ...player,
          health: nextHealth,
          alive: !lethal,
          eliminatedRound: lethal ? round : null,
          totalMistakes: player.totalMistakes + 1,
          totalDamage: player.totalDamage + hit,
        },
      };
      contestantsRef.current = next;
      return next;
    });
    setBoard((current) => current.map((card, index) =>
      index === firstIndex || index === secondIndex
        ? { ...card, isFlipped: true, isMismatch: true }
        : card,
    ));

    if (lethal) {
      setPhase('death');
      setFlippedIndices([]);
      return;
    }

    window.setTimeout(() => {
      setBoard((current) => current.map((card, index) =>
        index === firstIndex || index === secondIndex
          ? { ...card, isFlipped: false, isMismatch: false }
          : card,
      ));
      setFlippedIndices([]);
      setLocked(false);
    }, 800);
  }, [board, humanId, playMatch, playMismatch, round, roundMistakes, sessionSeed, showDamageFlash]);

  const handleCardClick = useCallback((cardIndex: number) => {
    if (locked || phase !== 'playing') return;
    const card = board[cardIndex];
    if (!card || card.isPlaceholder || card.isMatched || card.isFlipped) return;
    playFlip();
    setBoard((current) => current.map((item, index) =>
      index === cardIndex ? { ...item, isFlipped: true } : item,
    ));
    if (flippedIndices.length === 0) {
      setFlippedIndices([cardIndex]);
      return;
    }
    resolvePair(flippedIndices[0], cardIndex);
  }, [board, flippedIndices, locked, phase, playFlip, resolvePair]);

  const continueRound = useCallback(() => {
    const nextRound = round + 1;
    const currentHumanHealth = contestantsRef.current[humanId]?.health ?? 0;
    setRound(nextRound);
    setBoard(buildHouseOfDarknessBoard(
      sessionSeed ^ Math.imul(nextRound, 0x85ebca6b),
      getHouseOfDarknessPairCount(nextRound),
    ));
    setFlippedIndices([]);
    setLocked(false);
    setMatchedPairs(0);
    setRoundMistakes(0);
    setRoundDamage(0);
    setRoundSummary(null);
    setDamageFlash(null);
    roundStartingHealthRef.current = currentHumanHealth;
    roundStartedAtRef.current = Date.now();
    roundCompletedRef.current = false;
    setPhase('playing');
  }, [humanId, round, sessionSeed]);

  const finish = useCallback(() => {
    if (standings.length === 0) return;
    const rawResults = Object.fromEntries(standings.map((state) => [state.id, rawScoreFor(state)]));
    onFinish?.(
      rawResults[humanId] ?? 0,
      undefined,
      {
        authoritativeWinnerId: standings[0]?.id ?? null,
        rawValue: rawResults[humanId] ?? 0,
        rawResults,
      },
    );
  }, [humanId, onFinish, standings]);

  if (phase === 'round_results' && roundSummary) {
    const rankedRoundResults = roundSummary.results.slice().sort((a, b) =>
      Number(a.died) - Number(b.died)
      || b.endingHealth - a.endingHealth
      || a.mistakes - b.mistakes,
    );
    return (
      <MinigameCompleteWrapper
        className="hod-complete hod-round-results"
        onContinue={continueRound}
        continueLabel="Descend deeper"
        continueButtonClassName="hod-continue"
        placementsNode={
          <ol className="hod-results-list" aria-label={`House of Darkness round ${roundSummary.round} survival results`}>
            {rankedRoundResults.map((result) => (
              <li key={result.id} className={`hod-result-row${result.died ? ' hod-result-row--dead' : ''}${result.id === humanId ? ' hod-result-row--human' : ''}`}>
                <div className="hod-result-main">
                  <strong>{nameFor(result.id)}{result.id === humanId ? ' (You)' : ''}</strong>
                  <span>{result.mistakes} mistakes · {result.damage}% lost · {result.recovered}% restored</span>
                </div>
                <strong>{result.died ? 'CONSUMED' : `${formatHouseOfDarknessHealth(result.endingHealth)}%`}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <p className="hod-complete-kicker">The house feeds</p>
        <h2 className="hod-complete-title">Round {roundSummary.round} survived</h2>
        <p className="hod-complete-copy">Only 20% of this round&apos;s wounds were returned. The rest follows you downstairs.</p>
      </MinigameCompleteWrapper>
    );
  }

  if (phase === 'results' && standings.length > 0) {
    const winner = standings[0];
    return (
      <MinigameCompleteWrapper
        className="hod-complete hod-final-results"
        onContinue={finish}
        continueLabel="Leave the house"
        continueButtonClassName="hod-continue"
        placementsNode={
          <ol className="hod-results-list" aria-label="House of Darkness final standings">
            {standings.map((state, index) => (
              <li key={state.id} className={`hod-result-row${state.alive ? '' : ' hod-result-row--dead'}${state.id === humanId ? ' hod-result-row--human' : ''}${index === 0 ? ' hod-result-row--winner' : ''}`}>
                <span className="hod-result-rank">{index + 1}</span>
                <div className="hod-result-main">
                  <strong>{nameFor(state.id)}{state.id === humanId ? ' (You)' : ''}</strong>
                  <span>{state.completedRounds} boards · {state.totalMistakes} mistakes · {state.totalDamage}% damage</span>
                </div>
                <strong>{state.alive ? `${formatHouseOfDarknessHealth(state.health)}%` : `Fell R${state.eliminatedRound ?? '?'}`}</strong>
              </li>
            ))}
          </ol>
        }
      >
        <p className="hod-complete-kicker">One soul remains</p>
        <h2 className="hod-complete-title">{nameFor(winner.id)} escapes the darkness</h2>
        <p className="hod-complete-copy">The house remembers everyone else.</p>
      </MinigameCompleteWrapper>
    );
  }

  const healthStyle: HealthStyle = { '--hod-health': `${humanHealth}%` };
  return (
    <div className="hod-root" data-phase={phase} data-health-band={humanHealth <= 20 ? 'critical' : humanHealth <= 45 ? 'danger' : 'stable'}>
      <div className="hod-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <header className="hod-heading">
        <span>Survival memory ritual</span>
        <strong>House of Darkness</strong>
        <small>Every mistake feeds the house.</small>
      </header>

      <section className="hod-life-panel" aria-label={`Your lifespan is ${formatHouseOfDarknessHealth(humanHealth)} percent`}>
        <div className="hod-life-copy">
          <span>LIFESPAN</span>
          <strong>{formatHouseOfDarknessHealth(humanHealth)}%</strong>
        </div>
        <div className="hod-life-track"><span style={healthStyle} /></div>
        <small>{roundDamage > 0 ? `${roundDamage}% wounded this round · 20% returns on completion` : 'Complete the board to preserve your remaining life'}</small>
      </section>

      <div className="hod-hud">
        <div><strong>Round {round}</strong><span>{pairCount} pairs</span></div>
        <div><strong>{matchedPairs}/{pairCount}</strong><span>bound</span></div>
        <div><strong>{roundMistakes}</strong><span>mistakes</span></div>
        <div><strong>{playableCards}</strong><span>live cards</span></div>
      </div>

      <div className="hod-survivors" aria-label="Contestant lifespan">
        {resolvedIds.map((id) => {
          const state = contestants[id];
          if (!state) return null;
          return (
            <div key={id} className={`hod-survivor${id === humanId ? ' hod-survivor--human' : ''}${state.alive ? '' : ' hod-survivor--dead'}`}>
              <span>{nameFor(id)}</span>
              <strong>{state.alive ? `${formatHouseOfDarknessHealth(state.health)}%` : 'VOID'}</strong>
            </div>
          );
        })}
      </div>

      <div className="hod-board-wrap">
        <div className="hod-board" style={boardStyle} role="grid" aria-label={`House of Darkness round ${round} memory board`}>
          {board.map((card) => (
            <button
              key={card.index}
              type="button"
              role="gridcell"
              className={`hod-card${card.isPlaceholder ? ' hod-card--placeholder' : ''}`}
              data-flipped={card.isFlipped ? 'true' : 'false'}
              data-matched={card.isMatched ? 'true' : 'false'}
              data-mismatch={card.isMismatch ? 'true' : 'false'}
              disabled={locked || card.isMatched || card.isPlaceholder || phase !== 'playing'}
              onClick={() => handleCardClick(card.index)}
              aria-label={card.isPlaceholder ? 'Sealed void slot' : card.isFlipped || card.isMatched ? card.symbol : 'Hidden haunted card'}
            >
              {card.isPlaceholder ? (
                <span className="hod-placeholder-mark" aria-hidden="true">VOID</span>
              ) : (
                <span className="hod-card-inner">
                  <span className="hod-card-face hod-card-back"><span className="hod-card-sigil" aria-hidden="true">✦</span></span>
                  <span className="hod-card-face hod-card-front">{card.symbol}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {damageFlash !== null && phase === 'playing' && (
        <div className="hod-damage-flash" aria-live="assertive"><strong>−{damageFlash}%</strong><span>The house took its share</span></div>
      )}

      {phase === 'death' && (
        <div className="hod-death" role="alert" aria-live="assertive">
          <div className="hod-death-cracks" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
          <div className="hod-void" aria-hidden="true" />
          <div className="hod-death-message">
            <span>YOUR LIGHT IS GONE</span>
            <strong>THE HOUSE HAS YOU</strong>
          </div>
        </div>
      )}
    </div>
  );
}
