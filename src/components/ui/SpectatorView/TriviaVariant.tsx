/**
 * TriviaVariant — "timed trivia" spectator visualization.
 *
 * Shows each competitor's point tally growing as scores increase.
 * During simulation a live "current question" panel cycles through
 * BB-themed questions. When the authoritative winner is revealed,
 * their score surges to 100.
 */

import type { CompetitorProgress } from './progressEngine';

interface TriviaVariantProps {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  simPct?: number;
  resolveAvatar: (id: string) => string;
  getPlayerName: (id: string | undefined) => string;
}

// ── Big Brother–themed trivia questions shown during simulation ───────────────

const BB_QUESTIONS = [
  {
    q: 'What competition decides weekly nominations?',
    answers: ['Veto', 'HoH', 'Battle Back', 'Have-Not'],
    ai: 1,
  },
  {
    q: 'How many jury members typically vote in a Final 2?',
    answers: ['5', '7', '9', 'Varies'],
    ai: 1,
  },
  {
    q: 'Final 3 Part 3 is a ___ competition.',
    answers: ['Endurance', 'Mental', 'Questions', 'Physical'],
    ai: 2,
  },
  {
    q: 'What does "PoV" stand for?',
    answers: ['Power of Veto', 'Part of Victory', 'Player Value', 'Proof of Win'],
    ai: 0,
  },
  {
    q: 'Jury members live together in the ___ house.',
    answers: ['Camp', 'Studio', 'Jury', 'Archive'],
    ai: 2,
  },
];

export default function TriviaVariant({
  competitors,
  phase,
  simPct = 0,
  resolveAvatar,
  getPlayerName,
}: TriviaVariantProps) {
  const isSimulating = phase === 'simulating';

  // Determine leader
  const leaderId = isSimulating
    ? [...competitors].sort((a, b) => b.score - a.score)[0]?.id
    : null;

  // Cycle questions based on simPct; each question spans ~20% of sim time
  const qIdx = Math.min(
    BB_QUESTIONS.length - 1,
    Math.floor(simPct / (100 / BB_QUESTIONS.length)),
  );
  const currentQ = BB_QUESTIONS[qIdx];
  // Progress within this question slot (0–100)
  const slotSize = 100 / BB_QUESTIONS.length;
  const slotPct = ((simPct % slotSize) / slotSize) * 100;

  return (
    <div className="sv-variant sv-trivia" aria-label="Trivia competition">
      {/* Live question panel — only during simulation */}
      {isSimulating && (
        <div className="sv-trivia__question-panel">
          <div className="sv-trivia__qmeta">
            <span className="sv-trivia__qnum">
              Question {qIdx + 1}/{BB_QUESTIONS.length}
            </span>
            {/* Per-question countdown bar */}
            <div className="sv-trivia__qtimer-bg">
              <div
                className="sv-trivia__qtimer-fill"
                style={{ width: `${100 - slotPct}%` }}
              />
            </div>
          </div>
          <p className="sv-trivia__question-text">{currentQ.q}</p>
          <div className="sv-trivia__answers">
            {currentQ.answers.map((a, i) => (
              <span
                key={i}
                className={`sv-trivia__answer${i === currentQ.ai ? ' sv-trivia__answer--correct' : ''}`}
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="sv-trivia__board">
        {[...competitors]
          .sort((a, b) => b.score - a.score)
          .map((c, rank) => {
            const isLeader = c.id === leaderId && !c.isWinner;
            return (
              <div
                key={c.id}
                className={[
                  'sv-trivia__row',
                  c.isWinner ? 'sv-trivia__row--winner'  : '',
                  isLeader   ? 'sv-trivia__row--leading' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="sv-trivia__rank" aria-hidden="true">
                  {rank + 1}
                </span>

                <img
                  src={resolveAvatar(c.id)}
                  alt=""
                  className="sv-trivia__avatar"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />

                <span className="sv-trivia__name">{getPlayerName(c.id)}</span>

                {/* Inline progress bar */}
                <div className="sv-trivia__bar-bg" aria-hidden="true">
                  <div
                    className="sv-trivia__bar-fill"
                    style={{ width: `${c.score}%` }}
                  />
                </div>

                <span
                  className="sv-trivia__pts"
                  aria-label={`${getPlayerName(c.id)} ${Math.round(c.score)} points`}
                >
                  {Math.round(c.score)} pts
                </span>

                {c.isWinner && (
                  <span className="sv-trivia__badge" aria-label="winner">
                    🏆
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {phase === 'revealed' && (
        <p className="sv-result-caption" aria-live="assertive">
          🎉 {getPlayerName(competitors.find((c) => c.isWinner)?.id ?? '')} wins the trivia!
        </p>
      )}
    </div>
  );
}
