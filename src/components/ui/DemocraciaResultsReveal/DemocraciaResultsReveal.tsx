import { useEffect } from 'react';
import type { Player } from '../../../types';
import PlayerAvatar from '../../PlayerAvatar/PlayerAvatar';
import './DemocraciaResultsReveal.css';

type DemocraciaResultsRevealParticipant = {
  player: Player;
  voteCount: number;
};

type DemocraciaResultsRevealProps = {
  mode: 'winner' | 'tie' | 'message';
  title: string;
  subtitle: string;
  participants: DemocraciaResultsRevealParticipant[];
  onDone: () => void;
  countdownMs?: number;
};

const DEFAULT_COUNTDOWN_MS = 2600;

export default function DemocraciaResultsReveal({
  mode,
  title,
  subtitle,
  participants,
  onDone,
  countdownMs = DEFAULT_COUNTDOWN_MS,
}: DemocraciaResultsRevealProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDone(), countdownMs);
    return () => window.clearTimeout(timeoutId);
  }, [countdownMs, onDone]);

  const badgeLabel =
    mode === 'winner'
      ? 'Winner'
      : mode === 'tie'
        ? 'Tie'
        : 'Revote';

  return (
    <section className="democracia-results" aria-label="Democracia results">
      <div className="democracia-results__badge">{badgeLabel}</div>
      <div className="democracia-results__body">
        <h2 className="democracia-results__title">{title}</h2>
        <p className="democracia-results__subtitle">{subtitle}</p>
        {participants.length > 0 && (
          <div
            className={[
              'democracia-results__participants',
              participants.length === 1 ? 'democracia-results__participants--solo' : '',
              participants.length === 2 ? 'democracia-results__participants--pair' : '',
            ].filter(Boolean).join(' ')}
          >
            {participants.map(({ player, voteCount }) => (
              <article className="democracia-results__participant" key={player.id}>
                <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
                <span className="democracia-results__participant-name">{player.name}</span>
                <span className="democracia-results__participant-count">
                  {voteCount} vote{voteCount === 1 ? '' : 's'}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
