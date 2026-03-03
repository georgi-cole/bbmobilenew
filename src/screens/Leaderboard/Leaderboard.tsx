import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { computeSeasonLeaderboard } from '../../scoring/computeLeaderboard';
import { computeAllTimeLeaderboard } from '../../scoring/computeAllTime';
import { DEFAULT_WEIGHTS } from '../../scoring/weights';
import './Leaderboard.css';

type Tab = 'season' | 'alltime';

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const players = useAppSelector((s) => s.game.players);
  const seasonArchives = useAppSelector((s) => s.game.seasonArchives ?? []);
  const userPlayerId = players.find((p) => p.isUser)?.id ?? null;

  // Build a season summary from current live players for "This Season" tab
  const liveSummaries = players.map((p) => ({
    playerId: p.id,
    displayName: p.name,
    finalPlacement: p.finalRank ?? null,
    hohWins: p.stats?.hohWins ?? 0,
    povWins: p.stats?.povWins ?? 0,
    timesNominated: p.stats?.timesNominated ?? 0,
    battleBackWins: p.stats?.battleBackWins ?? 0,
    wonFinalHoh: p.stats?.wonFinalHoh ?? false,
    madeJury: p.status === 'jury' || p.finalRank != null,
  }));

  const seasonEntries = computeSeasonLeaderboard(liveSummaries, DEFAULT_WEIGHTS);
  const allTimeEntries = computeAllTimeLeaderboard(seasonArchives, DEFAULT_WEIGHTS);

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="placeholder-screen leaderboard-screen">
      <h1 className="placeholder-screen__title">🏆 Leaderboard</h1>

      <div className="leaderboard-screen__tabs">
        <button
          className={`leaderboard-screen__tab${tab === 'season' ? ' leaderboard-screen__tab--active' : ''}`}
          onClick={() => setTab('season')}
        >
          This Season
        </button>
        <button
          className={`leaderboard-screen__tab${tab === 'alltime' ? ' leaderboard-screen__tab--active' : ''}`}
          onClick={() => setTab('alltime')}
        >
          All-Time
        </button>
      </div>

      {tab === 'season' && (
        <ul className="leaderboard-screen__list">
          {seasonEntries.map((entry, i) => {
            const isUser = entry.playerId === userPlayerId;
            const isExpanded = expandedId === entry.playerId;
            const bd = entry.breakdown;
            return (
              <li
                key={entry.playerId}
                className={`leaderboard-screen__row${isUser ? ' leaderboard-screen__row--you' : ''}`}
              >
                <button
                  className="leaderboard-screen__row-main"
                  onClick={() => toggleExpand(entry.playerId)}
                  aria-expanded={isExpanded}
                >
                  <span className="leaderboard-screen__rank">#{i + 1}</span>
                  <span className="leaderboard-screen__name">
                    {entry.displayName}{isUser ? ' (You)' : ''}
                  </span>
                  <span className={`leaderboard-screen__score${isUser ? ' leaderboard-screen__score--you' : ''}`}>
                    {entry.score} pts
                  </span>
                  <span className="leaderboard-screen__chevron">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && (
                  <ul className="leaderboard-screen__breakdown">
                    {bd.hohWins > 0 && <li>HOH wins: +{bd.hohWins}</li>}
                    {bd.povWins > 0 && <li>POV wins: +{bd.povWins}</li>}
                    {bd.wonFinalHoh > 0 && <li>Final HOH: +{bd.wonFinalHoh}</li>}
                    {bd.madeJury > 0 && <li>Made jury: +{bd.madeJury}</li>}
                    {bd.battleBackWins > 0 && <li>Battle Back win(s): +{bd.battleBackWins}</li>}
                    {bd.survivedDoubleEviction > 0 && <li>Survived double eviction: +{bd.survivedDoubleEviction}</li>}
                    {bd.survivedTripleEviction > 0 && <li>Survived triple eviction: +{bd.survivedTripleEviction}</li>}
                    {bd.wonPublicFavorite > 0 && <li>Public's Favorite: +{bd.wonPublicFavorite}</li>}
                    {bd.winBonus > 0 && <li>Win bonus: +{bd.winBonus}</li>}
                    {bd.runnerUp > 0 && <li>Runner-up: +{bd.runnerUp}</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'alltime' && (
        <ul className="leaderboard-screen__list">
          {allTimeEntries.length === 0 && (
            <li className="leaderboard-screen__empty">No completed seasons yet.</li>
          )}
          {allTimeEntries.map((entry, i) => {
            const isUser = entry.playerId === userPlayerId;
            const isExpanded = expandedId === `at-${entry.playerId}`;
            const bd = entry.breakdown;
            return (
              <li
                key={entry.playerId}
                className={`leaderboard-screen__row${isUser ? ' leaderboard-screen__row--you' : ''}`}
              >
                <button
                  className="leaderboard-screen__row-main"
                  onClick={() => toggleExpand(`at-${entry.playerId}`)}
                  aria-expanded={isExpanded}
                >
                  <span className="leaderboard-screen__rank">#{i + 1}</span>
                  <span className="leaderboard-screen__name">
                    {entry.displayName}{isUser ? ' (You)' : ''}
                  </span>
                  <span className={`leaderboard-screen__score${isUser ? ' leaderboard-screen__score--you' : ''}`}>
                    {entry.totalScore} pts
                  </span>
                  <span className="leaderboard-screen__chevron">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && (
                  <ul className="leaderboard-screen__breakdown">
                    <li>Seasons played: {entry.seasonsPlayed}</li>
                    <li>Wins: {entry.wins}</li>
                    {bd.hohWins > 0 && <li>HOH wins: +{bd.hohWins}</li>}
                    {bd.povWins > 0 && <li>POV wins: +{bd.povWins}</li>}
                    {bd.wonFinalHoh > 0 && <li>Final HOH: +{bd.wonFinalHoh}</li>}
                    {bd.madeJury > 0 && <li>Made jury: +{bd.madeJury}</li>}
                    {bd.battleBackWins > 0 && <li>Battle Back win(s): +{bd.battleBackWins}</li>}
                    {bd.survivedDoubleEviction > 0 && <li>Survived double eviction: +{bd.survivedDoubleEviction}</li>}
                    {bd.survivedTripleEviction > 0 && <li>Survived triple eviction: +{bd.survivedTripleEviction}</li>}
                    {bd.wonPublicFavorite > 0 && <li>Public's Favorite: +{bd.wonPublicFavorite}</li>}
                    {bd.winBonus > 0 && <li>Win bonus: +{bd.winBonus}</li>}
                    {bd.runnerUp > 0 && <li>Runner-up: +{bd.runnerUp}</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
