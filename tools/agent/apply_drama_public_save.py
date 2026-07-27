from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8-sig")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{label}: start marker missing")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{label}: end marker missing")
    return text[:start_index] + replacement + text[end_index:]


PUBLIC_SAVE_SERVICE = r'''import type { PlayerPublicProfile } from './types';

export interface PublicSaveResult {
  savedId: string;
  tieBreakUsed: boolean;
  voteShareByPlayerId: Record<string, number>;
  winningShare: number;
}

const FLOAT_EQUALITY_EPSILON = 0.001;
const SHARE_UNITS = 1000; // tenths of one percent

function seasonAvg(profile: PlayerPublicProfile): number {
  if (profile.seasonApprovals.length === 0) return profile.approval;
  return profile.seasonApprovals.reduce((sum, value) => sum + value, 0) /
    profile.seasonApprovals.length;
}

/**
 * Convert arbitrary non-negative audience scores into percentages that total
 * exactly 100.0. Largest-remainder allocation keeps the result deterministic.
 */
export function normalisePublicSaveVoteShares(
  playerIds: string[],
  scores: Record<string, number>,
): Record<string, number> {
  if (playerIds.length === 0) return {};

  const safeScores = playerIds.map((playerId) => {
    const value = scores[playerId];
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  });
  const total = safeScores.reduce((sum, value) => sum + value, 0);
  const weightedScores = total > 0 ? safeScores : safeScores.map(() => 1);
  const weightedTotal = weightedScores.reduce((sum, value) => sum + value, 0);

  const exactUnits = weightedScores.map((value) => (value / weightedTotal) * SHARE_UNITS);
  const allocatedUnits = exactUnits.map(Math.floor);
  let remaining = SHARE_UNITS - allocatedUnits.reduce((sum, value) => sum + value, 0);

  const remainderOrder = playerIds
    .map((playerId, index) => ({
      playerId,
      index,
      remainder: exactUnits[index] - allocatedUnits[index],
    }))
    .sort((left, right) =>
      right.remainder - left.remainder || left.playerId.localeCompare(right.playerId),
    );

  for (let index = 0; index < remainderOrder.length && remaining > 0; index += 1) {
    allocatedUnits[remainderOrder[index].index] += 1;
    remaining -= 1;
    if (index === remainderOrder.length - 1 && remaining > 0) index = -1;
  }

  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, allocatedUnits[index] / 10]),
  );
}

export function buildPublicSaveVoteShares(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): Record<string, number> {
  const scores = Object.fromEntries(
    params.nomineeIds.map((playerId) => [
      playerId,
      Math.max(0, params.profiles[playerId]?.approval ?? 50),
    ]),
  );
  return normalisePublicSaveVoteShares(params.nomineeIds, scores);
}

/**
 * Resolve the Normal Mode public save. The existing ranking rules remain
 * unchanged; the returned display shares are now a real 100% vote distribution.
 */
export function resolvePublicSaveNominee(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): PublicSaveResult {
  const { nomineeIds, profiles } = params;
  const voteShareByPlayerId = buildPublicSaveVoteShares(params);

  if (nomineeIds.length === 0) {
    return { savedId: '', tieBreakUsed: false, voteShareByPlayerId, winningShare: 0 };
  }
  if (nomineeIds.length === 1) {
    const savedId = nomineeIds[0];
    return {
      savedId,
      tieBreakUsed: false,
      voteShareByPlayerId,
      winningShare: voteShareByPlayerId[savedId] ?? 100,
    };
  }

  const sorted = [...nomineeIds].sort((leftId, rightId) => {
    const left = profiles[leftId];
    const right = profiles[rightId];
    if (!left && !right) return leftId.localeCompare(rightId);
    if (!left) return 1;
    if (!right) return -1;
    if (right.approval !== left.approval) return right.approval - left.approval;

    const averageDifference = seasonAvg(right) - seasonAvg(left);
    if (Math.abs(averageDifference) > FLOAT_EQUALITY_EPSILON) return averageDifference;
    if (right.completedDirectionCount !== left.completedDirectionCount) {
      return right.completedDirectionCount - left.completedDirectionCount;
    }
    return leftId.localeCompare(rightId);
  });

  const savedId = sorted[0];
  const runnerUpId = sorted[1];
  const winnerProfile = profiles[savedId];
  const runnerUpProfile = profiles[runnerUpId];
  const tieBreakUsed =
    !winnerProfile ||
    !runnerUpProfile ||
    winnerProfile.approval === runnerUpProfile.approval;

  return {
    savedId,
    tieBreakUsed,
    voteShareByPlayerId,
    winningShare: voteShareByPlayerId[savedId] ?? 0,
  };
}
'''

DRAMA_PUBLIC_SAVE_SERVICE = r'''import { normalisePublicSaveVoteShares } from './PublicSaveService';
import type { PlayerPublicProfile, PublicFeedEntry } from './types';

export type DramaPublicSaveDecisiveReason =
  | 'approval'
  | 'momentum'
  | 'storyline'
  | 'tiebreak';

export interface DramaPublicSaveResult {
  savedId: string;
  voteShareByPlayerId: Record<string, number>;
  winningShare: number;
  winningMargin: number;
  tieBreakUsed: boolean;
  decisiveReason: DramaPublicSaveDecisiveReason;
  scoreByPlayerId: Record<string, number>;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function currentStorylineScore(playerId: string, feed: PublicFeedEntry[], week: number): number {
  const impact = feed
    .filter((entry) => entry.playerId === playerId && entry.week === week)
    .slice(0, 4)
    .reduce((sum, entry) => sum + entry.delta, 0);
  return clamp(50 + clamp(impact, -20, 20) * 2.5, 0, 100);
}

function momentumScore(profile: PlayerPublicProfile | undefined): number {
  if (!profile) return 50;
  const momentum = clamp(profile.approval - profile.previousApproval, -12, 12);
  return clamp(50 + momentum * 4, 0, 100);
}

function stableTieBreak(
  playerIds: string[],
  profiles: Record<string, PlayerPublicProfile>,
): string[] {
  return [...playerIds].sort((leftId, rightId) => {
    const left = profiles[leftId];
    const right = profiles[rightId];
    if (!left && !right) return leftId.localeCompare(rightId);
    if (!left) return 1;
    if (!right) return -1;
    const leftAverage = left.seasonApprovals.length
      ? left.seasonApprovals.reduce((sum, value) => sum + value, 0) / left.seasonApprovals.length
      : left.approval;
    const rightAverage = right.seasonApprovals.length
      ? right.seasonApprovals.reduce((sum, value) => sum + value, 0) / right.seasonApprovals.length
      : right.approval;
    if (rightAverage !== leftAverage) return rightAverage - leftAverage;
    if (right.completedDirectionCount !== left.completedDirectionCount) {
      return right.completedDirectionCount - left.completedDirectionCount;
    }
    return leftId.localeCompare(rightId);
  });
}

export function resolveDramaPublicSave(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
  feed: PublicFeedEntry[];
  week: number;
}): DramaPublicSaveResult {
  const { nomineeIds, profiles, feed, week } = params;
  const components = Object.fromEntries(
    nomineeIds.map((playerId) => {
      const profile = profiles[playerId];
      return [
        playerId,
        {
          approval: clamp(profile?.approval ?? 50, 0, 100),
          momentum: momentumScore(profile),
          storyline: currentStorylineScore(playerId, feed, week),
        },
      ];
    }),
  );
  const scoreByPlayerId = Object.fromEntries(
    nomineeIds.map((playerId) => {
      const component = components[playerId];
      return [
        playerId,
        component.approval * 0.7 + component.momentum * 0.2 + component.storyline * 0.1,
      ];
    }),
  );
  const voteShareByPlayerId = normalisePublicSaveVoteShares(nomineeIds, scoreByPlayerId);

  if (nomineeIds.length === 0) {
    return {
      savedId: '',
      voteShareByPlayerId,
      winningShare: 0,
      winningMargin: 0,
      tieBreakUsed: false,
      decisiveReason: 'tiebreak',
      scoreByPlayerId,
    };
  }

  const ranked = [...nomineeIds].sort((leftId, rightId) => {
    const difference = scoreByPlayerId[rightId] - scoreByPlayerId[leftId];
    if (Math.abs(difference) > 0.001) return difference;
    return stableTieBreak([leftId, rightId], profiles).indexOf(leftId) === 0 ? -1 : 1;
  });
  const savedId = ranked[0];
  const runnerUpId = ranked[1];
  const tieBreakUsed = runnerUpId
    ? Math.abs(scoreByPlayerId[savedId] - scoreByPlayerId[runnerUpId]) <= 0.001
    : false;
  const winningShare = voteShareByPlayerId[savedId] ?? 0;
  const winningMargin = runnerUpId
    ? Math.max(0, winningShare - (voteShareByPlayerId[runnerUpId] ?? 0))
    : winningShare;

  let decisiveReason: DramaPublicSaveDecisiveReason = tieBreakUsed ? 'tiebreak' : 'approval';
  if (runnerUpId && !tieBreakUsed) {
    const winner = components[savedId];
    const runnerUp = components[runnerUpId];
    const weightedAdvantages = {
      approval: (winner.approval - runnerUp.approval) * 0.7,
      momentum: (winner.momentum - runnerUp.momentum) * 0.2,
      storyline: (winner.storyline - runnerUp.storyline) * 0.1,
    };
    decisiveReason = (Object.entries(weightedAdvantages).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? 'approval') as DramaPublicSaveDecisiveReason;
  }

  return {
    savedId,
    voteShareByPlayerId,
    winningShare,
    winningMargin,
    tieBreakUsed,
    decisiveReason,
    scoreByPlayerId,
  };
}
'''

AUDIENCE_VERDICT = r'''import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import './AudienceVerdictReveal.css';

export interface AudienceVerdictRevealProps {
  nominees: Player[];
  voteShares: Record<string, number>;
  savedId: string;
  onDone: () => void;
}

type VerdictPhase = 'interrupt' | 'lineup' | 'settling' | 'result' | 'exiting';

const LINEUP_MS = 500;
const SETTLING_MS = 2200;
const RESULT_MS = 3400;
const EXIT_MS = 5400;
const DONE_MS = 6200;
const CLOSE_VOTE_MARGIN = 2;

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

export default function AudienceVerdictReveal({
  nominees,
  voteShares,
  savedId,
  onDone,
}: AudienceVerdictRevealProps) {
  const [phase, setPhase] = useState<VerdictPhase>('interrupt');
  const timersRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);
  const fireDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    onDone();
  }, [clearTimers, onDone]);

  useEffect(() => {
    doneRef.current = false;
    if (document.body.classList.contains('no-animations')) {
      setPhase('result');
      const timer = window.setTimeout(fireDone, 0);
      return () => window.clearTimeout(timer);
    }
    timersRef.current = [
      window.setTimeout(() => setPhase('lineup'), LINEUP_MS),
      window.setTimeout(() => setPhase('settling'), SETTLING_MS),
      window.setTimeout(() => setPhase('result'), RESULT_MS),
      window.setTimeout(() => setPhase('exiting'), EXIT_MS),
      window.setTimeout(fireDone, DONE_MS),
    ];
    return clearTimers;
  }, [clearTimers, fireDone]);

  const ranked = useMemo(
    () => [...nominees].sort((left, right) =>
      (voteShares[right.id] ?? 0) - (voteShares[left.id] ?? 0) || left.id.localeCompare(right.id),
    ),
    [nominees, voteShares],
  );
  const winningShare = voteShares[savedId] ?? 0;
  const runnerUpShare = ranked.find((player) => player.id !== savedId)
    ? voteShares[ranked.find((player) => player.id !== savedId)!.id] ?? 0
    : 0;
  const closeVote = winningShare - runnerUpShare <= CLOSE_VOTE_MARGIN;
  const savedPlayer = nominees.find((player) => player.id === savedId);
  const resultVisible = phase === 'result' || phase === 'exiting';

  const skipToResult = useCallback(() => {
    if (resultVisible || doneRef.current) return;
    clearTimers();
    setPhase('result');
    timersRef.current = [
      window.setTimeout(() => setPhase('exiting'), 1500),
      window.setTimeout(fireDone, 2100),
    ];
  }, [clearTimers, fireDone, resultVisible]);

  return (
    <div
      className={`avr avr--${phase}`}
      role="button"
      tabIndex={0}
      aria-label={`Audience Verdict: ${savedPlayer?.name ?? 'a nominee'} is saved. Tap to reveal now.`}
      onClick={skipToResult}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          skipToResult();
        }
      }}
    >
      <div className="avr__broadcast-head">
        <span className="avr__live-dot" aria-hidden="true" />
        <span>LIVE · AUDIENCE VERDICT</span>
      </div>
      <p className="avr__prompt">The public has voted to save one nominee.</p>

      <div className="avr__lineup">
        {nominees.map((player) => {
          const isSaved = player.id === savedId;
          return (
            <div
              className={`avr__nominee${resultVisible && isSaved ? ' avr__nominee--saved' : ''}${resultVisible && !isSaved ? ' avr__nominee--danger' : ''}`}
              key={player.id}
            >
              <div className="avr__portrait">
                <PlayerAvatar player={player} size="sm" />
              </div>
              <span className="avr__name">{player.name}</span>
              <span className="avr__share">
                {phase === 'settling' || resultVisible ? formatShare(voteShares[player.id] ?? 0) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="avr__vote-strip" aria-label="Public save vote distribution">
        {nominees.map((player) => (
          <span
            key={player.id}
            className={`avr__vote-segment${resultVisible && player.id === savedId ? ' avr__vote-segment--winner' : ''}`}
            style={{ width: `${voteShares[player.id] ?? 0}%` }}
            title={`${player.name}: ${formatShare(voteShares[player.id] ?? 0)}`}
          />
        ))}
      </div>

      {phase === 'settling' && closeVote && (
        <div className="avr__close-call">TOO CLOSE TO CALL</div>
      )}

      {resultVisible && savedPlayer && (
        <div className="avr__lower-third" aria-live="assertive">
          <strong>{savedPlayer.name.toUpperCase()} SAVED BY THE PUBLIC</strong>
          <span>{formatShare(winningShare)} of the save vote</span>
        </div>
      )}
    </div>
  );
}
'''

AUDIENCE_VERDICT_CSS = r'''.avr {
  position: absolute;
  inset: 0;
  z-index: 24;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.62rem;
  padding: 0.7rem 0.85rem;
  overflow: hidden;
  color: #f8fbff;
  background:
    radial-gradient(circle at 50% 22%, rgba(97, 166, 255, 0.2), transparent 42%),
    linear-gradient(180deg, rgba(5, 11, 25, 0.98), rgba(8, 15, 32, 0.96));
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.35s ease;
}
.avr--interrupt::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 5px);
  animation: avrSignal .16s steps(2) 3;
  pointer-events: none;
}
.avr--exiting { opacity: 0; }
.avr__broadcast-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.36rem;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: #9ecbff;
}
.avr__live-dot {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: #f87171;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.75);
}
.avr__prompt {
  margin: 0;
  text-align: center;
  font-size: 0.72rem;
  color: rgba(245, 249, 255, 0.78);
}
.avr__lineup {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}
.avr__nominee {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.18rem;
  min-width: 0;
  opacity: 0;
  transform: translateY(8px) scale(0.92);
  transition: opacity .35s ease, transform .45s cubic-bezier(.2,.9,.2,1), filter .35s ease;
}
.avr--lineup .avr__nominee,
.avr--settling .avr__nominee,
.avr--result .avr__nominee,
.avr--exiting .avr__nominee { opacity: 1; transform: none; }
.avr__portrait {
  display: inline-flex;
  border-radius: 999px;
  padding: 2px;
  border: 1px solid rgba(164, 205, 255, 0.28);
}
.avr__nominee--saved {
  transform: translateY(-3px) scale(1.08) !important;
  filter: drop-shadow(0 0 14px rgba(115, 190, 255, 0.62));
}
.avr__nominee--danger { filter: grayscale(.72) saturate(.62); opacity: .58 !important; }
.avr__name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .7rem; font-weight: 700; }
.avr__share { font-size: .68rem; font-weight: 800; color: #b9d9ff; }
.avr__vote-strip {
  display: flex;
  width: 100%;
  height: .48rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.1);
}
.avr__vote-segment { min-width: 1px; background: rgba(123, 180, 244, .48); border-right: 1px solid rgba(4,10,24,.58); transition: width .75s ease; }
.avr__vote-segment:nth-child(2) { background: rgba(166, 139, 250, .48); }
.avr__vote-segment:nth-child(3) { background: rgba(94, 234, 212, .42); }
.avr__vote-segment--winner { background: linear-gradient(90deg, #5ea8ff, #a78bfa) !important; box-shadow: 0 0 10px rgba(114, 178, 255, .52); }
.avr__close-call { text-align: center; font-size: .65rem; font-weight: 900; letter-spacing: .14em; color: #f8fafc; animation: avrPulse .55s ease-in-out infinite alternate; }
.avr__lower-third {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .08rem;
  text-align: center;
  padding: .38rem .55rem;
  border-top: 1px solid rgba(151, 200, 255, .26);
  border-bottom: 1px solid rgba(151, 200, 255, .18);
  background: linear-gradient(90deg, transparent, rgba(76, 132, 217, .2), transparent);
}
.avr__lower-third strong { font-size: .72rem; letter-spacing: .08em; }
.avr__lower-third span { font-size: .65rem; color: #b9d9ff; }
@keyframes avrSignal { 0% { transform: translateX(-2px); opacity: .75; } 100% { transform: translateX(2px); opacity: .18; } }
@keyframes avrPulse { from { opacity: .65; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .avr, .avr__nominee, .avr__vote-segment { animation: none !important; transition: none !important; }
}
'''

PUBLIC_SAVE_REVEAL = r'''/**
 * PublicSaveReveal keeps the existing Normal Mode presentation and switches to
 * the premium Audience Verdict broadcast only when GameScreen explicitly asks
 * for the Drama Mode variant.
 */
import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import AudienceVerdictReveal from '../AudienceVerdictReveal/AudienceVerdictReveal';
import './PublicSaveReveal.css';

export interface PublicSaveRevealProps {
  nominees: Player[];
  approvals: Record<string, number>;
  savedId: string;
  onDone: () => void;
  variant?: 'normal' | 'drama';
}

type AnimPhase = 'entering' | 'revealing' | 'saved' | 'exiting';
const ENTER_TO_REVEAL_MS = 900;
const REVEAL_VALUES_MS = 5000;
const SHOW_SAVED_MS = 7600;
const EXIT_MS = 9300;
const DONE_MS = 10000;

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function NormalPublicSaveReveal({ nominees, approvals, savedId, onDone }: PublicSaveRevealProps) {
  const [phase, setPhase] = useState<AnimPhase>('entering');
  const [valuesRevealed, setValuesRevealed] = useState(false);
  const timersRef = useRef<number[]>([]);
  const doneRef = useRef(false);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);
  const fireDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    onDone();
  }, [clearTimers, onDone]);

  useEffect(() => {
    doneRef.current = false;
    if (document.body.classList.contains('no-animations')) {
      fireDone();
      return;
    }
    timersRef.current = [
      window.setTimeout(() => setPhase('revealing'), ENTER_TO_REVEAL_MS),
      window.setTimeout(() => setValuesRevealed(true), REVEAL_VALUES_MS),
      window.setTimeout(() => setPhase('saved'), SHOW_SAVED_MS),
      window.setTimeout(() => setPhase('exiting'), EXIT_MS),
      window.setTimeout(() => fireDone(), DONE_MS),
    ];
    return clearTimers;
  }, [clearTimers, fireDone]);

  return (
    <div className={`psr psr--${phase}`} role="status" aria-live="assertive">
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <p className="psr__heading-sub">Before safety battle, the player with highest public support is saved.</p>
        </div>
        <div className="psr__nominees">
          {nominees.map((player, index) => {
            const isSaved = player.id === savedId;
            const share = approvals[player.id] ?? 0;
            const formattedShare = formatShare(share);
            return (
              <div
                key={player.id}
                className={[
                  'psr__nominee',
                  isSaved && (phase === 'saved' || phase === 'exiting') ? 'psr__nominee--saved' : '',
                  !isSaved && (phase === 'saved' || phase === 'exiting') ? 'psr__nominee--nominated' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  '--stagger': index,
                  '--pending-width': `${32 + index * 6}%`,
                  '--pending-delay': `${index * 140}ms`,
                } as CSSProperties}
              >
                <div className="psr__avatar-wrap"><PlayerAvatar player={player} size="sm" /></div>
                <span className="psr__name">{player.name}</span>
                <div className="psr__bar-track">
                  <div className={`psr__bar-motion${!valuesRevealed ? ' psr__bar-motion--pending' : ''}`}>
                    <div
                      className="psr__bar-fill"
                      style={{ width: phase === 'entering' ? '0%' : valuesRevealed ? `${share}%` : 'var(--pending-width)' }}
                      aria-label={`${player.name} save vote: ${valuesRevealed ? formattedShare : 'pending reveal'}`}
                    />
                  </div>
                </div>
                <span className="psr__approval-value">{valuesRevealed ? formattedShare : '?? %'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PublicSaveReveal(props: PublicSaveRevealProps) {
  if (props.variant === 'drama') {
    return (
      <AudienceVerdictReveal
        nominees={props.nominees}
        voteShares={props.approvals}
        savedId={props.savedId}
        onDone={props.onDone}
      />
    );
  }
  return <NormalPublicSaveReveal {...props} />;
}
'''

PUBLIC_SAVE_TEST = r'''import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Player } from '../../../types';
import PublicSaveReveal from '../PublicSaveReveal';

function makePlayer(id: string, name: string): Player {
  return { id, name, avatar: '🧑', status: 'nominated' };
}
const nominees = [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian'), makePlayer('p3', 'Georgi')];
const shares = { p1: 31.2, p2: 32.1, p3: 36.7 };

describe('PublicSaveReveal Normal Mode', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.classList.remove('no-animations'); });
  afterEach(() => { vi.useRealTimers(); document.body.classList.remove('no-animations'); });

  it('keeps vote shares hidden until the five-second reveal point', () => {
    render(<PublicSaveReveal nominees={nominees} approvals={shares} savedId="p3" onDone={vi.fn()} />);
    expect(screen.getAllByText('?? %')).toHaveLength(3);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('31.2%')).toBeTruthy();
    expect(screen.getByText('32.1%')).toBeTruthy();
    expect(screen.getByText('36.7%')).toBeTruthy();
  });

  it('does not invent a decimal lead when the displayed vote is tied', () => {
    render(<PublicSaveReveal nominees={nominees} approvals={{ p1: 20, p2: 40, p3: 40 }} savedId="p3" onDone={vi.fn()} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getAllByText('40%')).toHaveLength(2);
  });

  it('highlights the saved nominee and preserves the ten-second Normal Mode timing', () => {
    const onDone = vi.fn();
    render(<PublicSaveReveal nominees={nominees} approvals={shares} savedId="p3" onDone={onDone} />);
    act(() => vi.advanceTimersByTime(7600));
    expect(document.querySelector('.psr__nominee--saved')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
'''

AUDIENCE_TEST = r'''import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Player } from '../../../types';
import AudienceVerdictReveal from '../AudienceVerdictReveal';

const makePlayer = (id: string, name: string): Player => ({ id, name, avatar: '🧑', status: 'nominated' });
const nominees = [makePlayer('a', 'Lia'), makePlayer('b', 'Nina'), makePlayer('c', 'Alex')];

describe('AudienceVerdictReveal', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.classList.remove('no-animations'); });
  afterEach(() => { vi.useRealTimers(); document.body.classList.remove('no-animations'); });

  it('reveals a close vote and completes the compact sequence', () => {
    const onDone = vi.fn();
    render(<AudienceVerdictReveal nominees={nominees} voteShares={{ a: 34, b: 33, c: 33 }} savedId="a" onDone={onDone} />);
    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText('TOO CLOSE TO CALL')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByText('LIA SAVED BY THE PUBLIC')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2800));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lets the player fast-forward by tapping the broadcast', () => {
    const onDone = vi.fn();
    render(<AudienceVerdictReveal nominees={nominees} voteShares={{ a: 42, b: 34, c: 24 }} savedId="a" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('LIA SAVED BY THE PUBLIC')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
'''

SERVICE_TEST = r'''import { describe, expect, it } from 'vitest';
import { buildPublicSaveVoteShares, resolvePublicSaveNominee } from '../../../src/publicOpinion/PublicSaveService';
import { resolveDramaPublicSave } from '../../../src/publicOpinion/DramaPublicSaveService';
import type { PlayerPublicProfile, PublicFeedEntry } from '../../../src/publicOpinion/types';

const profile = (playerId: string, approval: number, previousApproval = approval): PlayerPublicProfile => ({
  playerId,
  approval,
  previousApproval,
  seasonApprovals: [previousApproval, approval],
  completedDirectionCount: 0,
  cumulativePositiveDelta: 0,
});

describe('public save vote shares', () => {
  it('converts Normal Mode approval into a vote distribution totalling exactly 100', () => {
    const profiles = { a: profile('a', 70), b: profile('b', 50), c: profile('c', 30) };
    const shares = buildPublicSaveVoteShares({ nomineeIds: ['a', 'b', 'c'], profiles });
    expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(resolvePublicSaveNominee({ nomineeIds: ['a', 'b', 'c'], profiles }).savedId).toBe('a');
  });

  it('uses approval, momentum and visible storyline only in Drama Mode', () => {
    const profiles = {
      a: profile('a', 60, 60),
      b: profile('b', 58, 48),
      c: profile('c', 45, 45),
    };
    const feed: PublicFeedEntry[] = [{
      id: 'headline-b', playerId: 'b', text: 'Audience rallies behind B', delta: 8,
      week: 4, timestamp: 1, isHeadline: true,
    }];
    const result = resolveDramaPublicSave({ nomineeIds: ['a', 'b', 'c'], profiles, feed, week: 4 });
    expect(result.savedId).toBe('b');
    expect(Object.values(result.voteShareByPlayerId).reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});
'''


def patch_game_screen() -> None:
    path = 'src/screens/GameScreen/GameScreen.tsx'
    text = read(path)
    text = replace_once(
        text,
        "import { resolvePublicSaveNominee } from '../../publicOpinion/PublicSaveService'",
        "import { resolvePublicSaveNominee } from '../../publicOpinion/PublicSaveService'\nimport { resolveDramaPublicSave } from '../../publicOpinion/DramaPublicSaveService'",
        'GameScreen drama resolver import',
    )
    text = replace_once(
        text,
        "import type { PlayerPublicProfile } from '../../publicOpinion/types'",
        "import type { PlayerPublicProfile, PublicFeedEntry } from '../../publicOpinion/types'",
        'GameScreen public feed type import',
    )
    text = replace_once(
        text,
        "const EMPTY_PUBLIC_PROFILES: Record<string, PlayerPublicProfile> = {}",
        "const EMPTY_PUBLIC_PROFILES: Record<string, PlayerPublicProfile> = {}\nconst EMPTY_PUBLIC_FEED: PublicFeedEntry[] = []",
        'GameScreen empty feed constant',
    )
    text = replace_once(
        text,
        "type PendingPublicSaveResult = {\n  savedId: string\n  supportPercent?: number\n}",
        "type PendingPublicSaveResult = {\n  savedId: string\n  supportPercent?: number\n  dramaMode?: boolean\n}",
        'GameScreen pending save type',
    )
    text = replace_once(
        text,
        "  const pendingChallenge = useAppSelector(selectPendingChallenge)",
        "  const publicOpinionFeed = useAppSelector(\n    (s: RootState): PublicFeedEntry[] => s.publicOpinion?.feed ?? EMPTY_PUBLIC_FEED\n  )\n  const pendingChallenge = useAppSelector(selectPendingChallenge)",
        'GameScreen public feed selector',
    )

    public_block = r'''  // ── Pre-veto public save phase ───────────────────────────────────────────
  const dramaPublicSaveEnabled = settings.gameUX.dramaMode === true
  const showPublicSaveReveal =
    game.publicModeEnabled === true &&
    isPublicModeEnabled(game.mode) &&
    game.phase === 'pre_veto_public_save' &&
    Boolean(game.awaitingPublicSave) &&
    game.nomineeIds.length === 3 &&
    !pendingPublicSaveResult

  const publicSaveOutcome = useMemo(() => {
    if (!showPublicSaveReveal) return null
    if (dramaPublicSaveEnabled) {
      return resolveDramaPublicSave({
        nomineeIds: game.nomineeIds,
        profiles: publicOpinionProfiles,
        feed: publicOpinionFeed,
        week: game.week,
      })
    }
    return resolvePublicSaveNominee({
      nomineeIds: game.nomineeIds,
      profiles: publicOpinionProfiles,
    })
  }, [
    dramaPublicSaveEnabled,
    game.nomineeIds,
    game.week,
    publicOpinionFeed,
    publicOpinionProfiles,
    showPublicSaveReveal,
  ])

  const publicSaveApprovals = publicSaveOutcome?.voteShareByPlayerId ?? {}
  const publicSaveWinnerId = publicSaveOutcome?.savedId || null

  const publicSaveResultAnnouncement = useMemo<Announcement | null>(() => {
    if (!pendingPublicSaveResult || pendingPublicSaveResult.dramaMode) return null
    const savedPlayer = game.players.find((player) => player.id === pendingPublicSaveResult.savedId)
    if (!savedPlayer) return null
    const remainingNomineeNames = game.nomineeIds
      .filter((id) => id !== pendingPublicSaveResult.savedId)
      .map((id) => game.players.find((player) => player.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const subtitle =
      pendingPublicSaveResult.supportPercent != null && remainingNomineeNames.length === 2
        ? `${savedPlayer.name} was saved with ${pendingPublicSaveResult.supportPercent}% of the public save vote. ${remainingNomineeNames.join(' and ')} are still in danger.`
        : remainingNomineeNames.length === 2
          ? `${savedPlayer.name} was saved by the public. ${remainingNomineeNames.join(' and ')} are still in danger.`
          : `${savedPlayer.name} was saved by the public.`
    return {
      key: 'public_save_result',
      title: 'Public Save Result',
      subtitle,
      isLive: true,
      autoDismissMs: PUBLIC_SAVE_RESULT_DELAY_MS,
    }
  }, [game.nomineeIds, game.players, pendingPublicSaveResult])
  const publicSaveCeremonyKey = pendingPublicSaveResult
    ? `w${game.week}-public-save-${pendingPublicSaveResult.savedId}`
    : ''
  const showPublicSaveCeremony =
    game.publicModeEnabled === true &&
    isPublicModeEnabled(game.mode) &&
    publicSaveCeremonyKey !== '' &&
    publicSaveCeremonyKey !== publicSaveCeremonyConsumedKey

  const handlePublicSaveDone = useCallback(() => {
    if (!publicSaveOutcome?.savedId) return
    setPendingPublicSaveResult({
      savedId: publicSaveOutcome.savedId,
      supportPercent: publicSaveOutcome.winningShare,
      dramaMode: dramaPublicSaveEnabled,
    })
  }, [dramaPublicSaveEnabled, publicSaveOutcome])

  const handlePublicSaveResultDismiss = useCallback(() => {
    if (!pendingPublicSaveResult) return
    dispatch(commitPublicSave(pendingPublicSaveResult))
    setPendingPublicSaveResult(null)
  }, [dispatch, pendingPublicSaveResult])
  const handlePublicSaveCeremonyDone = useCallback(() => {
    if (!publicSaveCeremonyKey) return
    setPublicSaveCeremonyConsumedKey(publicSaveCeremonyKey)
    if (pendingPublicSaveResult?.dramaMode) {
      dispatch(commitPublicSave(pendingPublicSaveResult))
      setPendingPublicSaveResult(null)
    }
  }, [
    dispatch,
    pendingPublicSaveResult,
    publicSaveCeremonyKey,
    setPublicSaveCeremonyConsumedKey,
  ])

'''
    text = replace_between(
        text,
        '  // ── Pre-veto public save phase',
        '  const startReplacementCeremony = useCallback(',
        public_block,
        'GameScreen public save block',
    )
    text = replace_once(
        text,
        "              savedId: publicSaveWinnerId,\n            }}",
        "              savedId: publicSaveWinnerId,\n              variant: dramaPublicSaveEnabled ? 'drama' : 'normal',\n            }}",
        'GameScreen TV variant',
    )
    write(path, text)


def patch_tv_zone() -> None:
    path = 'src/components/ui/TvZone.tsx'
    text = read(path)
    text = replace_once(
        text,
        "type TvZonePublicSaveReveal = {\n  nominees: Player[];\n  approvals: Record<string, number>;\n  savedId: string;\n};",
        "type TvZonePublicSaveReveal = {\n  nominees: Player[];\n  approvals: Record<string, number>;\n  savedId: string;\n  variant?: 'normal' | 'drama';\n};",
        'TvZone public save type',
    )
    text = replace_once(
        text,
        "                savedId={props.publicSaveReveal.savedId}\n                onDone={props.onPublicSaveDone ?? NOOP}",
        "                savedId={props.publicSaveReveal.savedId}\n                variant={props.publicSaveReveal.variant}\n                onDone={props.onPublicSaveDone ?? NOOP}",
        'TvZone public save variant prop',
    )
    write(path, text)


def patch_social_slice() -> None:
    path = 'src/social/socialSlice.ts'
    text = read(path)
    insertion_point = text.find('    /** Apply', text.find('    updateRelationship('))
    if insertion_point < 0:
        raise RuntimeError('socialSlice insertion marker missing')
    reducer = r'''    /** Remove a temporary relationship tag from every directed edge. */
    removeRelationshipTagFromAll(state, action: PayloadAction<string>) {
      const tag = action.payload;
      for (const targets of Object.values(state.relationships)) {
        for (const relationship of Object.values(targets)) {
          relationship.tags = relationship.tags.filter((candidate) => candidate !== tag);
        }
      }
    },
'''
    text = text[:insertion_point] + reducer + text[insertion_point:]
    text = replace_once(
        text,
        '  updateRelationship,\n  updateSocialMemory,',
        '  updateRelationship,\n  removeRelationshipTagFromAll,\n  updateSocialMemory,',
        'socialSlice export temporary tag action',
    )
    write(path, text)


def patch_social_middleware() -> None:
    path = 'src/social/socialMiddleware.ts'
    text = read(path)
    text = replace_once(
        text,
        '  replaceDramaNetwork,\n  setEnergyBankEntry,\n  updateRelationship,',
        '  replaceDramaNetwork,\n  pushIncomingInteraction,\n  removeRelationshipTagFromAll,\n  setEnergyBankEntry,\n  updateRelationship,',
        'socialMiddleware action imports',
    )
    text = replace_once(
        text,
        "import { advanceDramaNetwork, normalizeDramaSocialNetwork } from './dramaModeEngine';",
        "import { advanceDramaNetwork, normalizeDramaSocialNetwork } from './dramaModeEngine';\nimport { resolveDramaPublicSave } from '../publicOpinion/DramaPublicSaveService';\nimport type { PlayerPublicProfile, PublicFeedEntry } from '../publicOpinion/types';",
        'socialMiddleware drama save imports',
    )
    text = replace_once(
        text,
        "  players: Array<{ id: string; name?: string; status: string; isUser?: boolean }>;\n}",
        "  players: Array<{ id: string; name?: string; status: string; isUser?: boolean }>;\n  publicModeEnabled?: boolean;\n  seed?: number;\n}\n",
        'socialMiddleware game interface',
    )
    text = replace_once(
        text,
        "    socialMemory?: SocialMemoryMap;\n  };\n}",
        "    socialMemory?: SocialMemoryMap;\n  };\n  publicOpinion?: {\n    profiles?: Record<string, PlayerPublicProfile>;\n    feed?: PublicFeedEntry[];\n  };\n}",
        'socialMiddleware public opinion state',
    )
    text = replace_once(
        text,
        "  const week = state.game?.week ?? 1;\n  api.dispatch(decaySocialMemory());",
        "  const week = state.game?.week ?? 1;\n  api.dispatch(removeRelationshipTagFromAll('public_threat'));\n  api.dispatch(decaySocialMemory());",
        'socialMiddleware threat expiry',
    )
    helper_marker = '/** Seed week-start background affinities, then snapshot relationships as baseline. */'
    helper = r'''function applyDramaPublicSaveConsequences(
  api: MiddlewareAPI,
  stateBefore: StateWithGame,
  savedId: string,
): void {
  if (
    stateBefore.settings?.gameUX?.dramaMode !== true ||
    stateBefore.game?.publicModeEnabled !== true
  ) return;

  const week = stateBefore.game.week ?? 1;
  const players = stateBefore.game.players ?? [];
  const savedPlayer = players.find((player) => player.id === savedId);
  if (!savedPlayer) return;
  const outcome = resolveDramaPublicSave({
    nomineeIds: stateBefore.game.nomineeIds ?? [],
    profiles: stateBefore.publicOpinion?.profiles ?? {},
    feed: stateBefore.publicOpinion?.feed ?? [],
    week,
  });

  const network = normalizeDramaSocialNetwork(stateBefore.social?.dramaNetwork);
  const eventId = `public-save-${week}-${savedId}`;
  if (!network.events.some((event) => event.id === eventId)) {
    api.dispatch(replaceDramaNetwork({
      ...network,
      events: [
        {
          id: eventId,
          type: 'arc_beat',
          week,
          phase: 'pre_veto_public_save',
          participantIds: [...(stateBefore.game.nomineeIds ?? [])],
          title: 'Audience Verdict',
          text: `${savedPlayer.name ?? savedId} was saved by the public with ${outcome.winningShare}% of the vote.`,
          detail: `Winning margin: ${outcome.winningMargin} points.`,
          consequence: 'Public support temporarily raises strategic threat perception.',
          public: true,
          severity: 'major',
          createdAt: Date.now(),
        },
        ...network.events,
      ].slice(0, 120),
    }));
  }

  for (const player of players) {
    if (player.id === savedId || player.status === 'evicted' || player.status === 'jury') continue;
    api.dispatch(updateRelationship({
      source: player.id,
      target: savedId,
      delta: 0,
      tags: ['public_threat'],
      actionSource: 'system',
    }));
  }

  const human = players.find((player) => player.isUser);
  if (!human) return;
  const relationship = stateBefore.social?.relationships?.[human.id]?.[savedId];
  const reverseRelationship = stateBefore.social?.relationships?.[savedId]?.[human.id];
  const affinity = relationship?.affinity ?? reverseRelationship?.affinity ?? 0;
  if (savedId !== human.id && Math.abs(affinity) < 20) return;

  const sourceCandidates = players
    .filter((player) => player.id !== human.id && player.status !== 'evicted' && player.status !== 'jury')
    .sort((left, right) => {
      const leftAffinity = stateBefore.social?.relationships?.[human.id]?.[left.id]?.affinity ?? 0;
      const rightAffinity = stateBefore.social?.relationships?.[human.id]?.[right.id]?.affinity ?? 0;
      return Math.abs(rightAffinity) - Math.abs(leftAffinity) || left.id.localeCompare(right.id);
    });
  const source = savedId === human.id ? sourceCandidates[0] : savedPlayer;
  if (!source) return;
  const sourceAffinity = stateBefore.social?.relationships?.[human.id]?.[source.id]?.affinity ?? 0;
  const text = savedId === human.id
    ? sourceAffinity >= 20
      ? `The public clearly believes in you. We need to stick together.`
      : sourceAffinity <= -20
        ? `Enjoy the save. It does not change where we stand.`
        : `That public save changed the temperature in the house. We should talk.`
    : affinity >= 20
      ? `${savedPlayer.name ?? savedId} has serious support outside. Keeping them close may matter.`
      : `${savedPlayer.name ?? savedId} just became a much bigger threat.`;

  api.dispatch(pushIncomingInteraction({
    id: `public-save-reaction-${week}-${source.id}-${savedId}`,
    fromId: source.id,
    type: sourceAffinity <= -20 ? 'snide_remark' : 'check_in',
    text,
    payload: { source: 'public_save', savedId, winningShare: outcome.winningShare },
    createdAt: Date.now(),
    createdWeek: week,
    expiresAtWeek: week + 1,
    read: false,
    requiresResponse: false,
    resolved: false,
  }));
}

'''
    text = replace_once(text, helper_marker, helper + helper_marker, 'socialMiddleware public save helper')
    action_marker = '  // ── Explicit phase-set actions (payload carries the new phase) ──────────────'
    handler = r'''  if (type === 'game/commitPublicSave') {
    const stateBefore = api.getState() as StateWithGame;
    const payload = (action as unknown as { payload: string | { savedId?: string } }).payload;
    const savedId = typeof payload === 'string' ? payload : payload?.savedId;
    const result = next(action);
    if (savedId) applyDramaPublicSaveConsequences(api as unknown as MiddlewareAPI, stateBefore, savedId);
    return result;
  }

'''
    text = replace_once(text, action_marker, handler + action_marker, 'socialMiddleware public save handler')
    write(path, text)


def patch_game_slice() -> None:
    path = 'src/store/gameSlice.ts'
    text = read(path)
    text = replace_once(
        text,
        "  if (tags.has('suspicious') || tags.has('unreliable')) score += 18\n  return score",
        "  if (tags.has('suspicious') || tags.has('unreliable')) score += 18\n  if (state.dramaSocialMode && tags.has('public_threat')) score += 8\n  return score",
        'gameSlice nomination public threat',
    )
    text = replace_once(
        text,
        "    if (tags.has('betrayal')) score += 35\n    if (tags.has('protection') || tags.has('shield')) score -= 20",
        "    if (tags.has('betrayal')) score += 35\n    if (state.dramaSocialMode && tags.has('public_threat')) score += 8\n    if (tags.has('protection') || tags.has('shield')) score -= 20",
        'gameSlice vote public threat',
    )
    write(path, text)


def main() -> None:
    write('src/publicOpinion/PublicSaveService.ts', PUBLIC_SAVE_SERVICE)
    write('src/publicOpinion/DramaPublicSaveService.ts', DRAMA_PUBLIC_SAVE_SERVICE)
    write('src/components/AudienceVerdictReveal/AudienceVerdictReveal.tsx', AUDIENCE_VERDICT)
    write('src/components/AudienceVerdictReveal/AudienceVerdictReveal.css', AUDIENCE_VERDICT_CSS)
    write('src/components/PublicSaveReveal/PublicSaveReveal.tsx', PUBLIC_SAVE_REVEAL)
    write('src/components/PublicSaveReveal/__tests__/PublicSaveReveal.test.tsx', PUBLIC_SAVE_TEST)
    write('src/components/AudienceVerdictReveal/__tests__/AudienceVerdictReveal.test.tsx', AUDIENCE_TEST)
    write('tests/unit/publicOpinion/publicSaveVoteShares.test.ts', SERVICE_TEST)
    patch_game_screen()
    patch_tv_zone()
    patch_social_slice()
    patch_social_middleware()
    patch_game_slice()
    print('Drama public save implementation applied.')


if __name__ == '__main__':
    main()
