import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppSelector } from '../../store/hooks';
import { findByName, getById } from '../../data/houseguests';
import { computeSeasonLeaderboard } from '../../scoring/computeLeaderboard';
import { computeAllTimeLeaderboard } from '../../scoring/computeAllTime';
import { DEFAULT_WEIGHTS } from '../../scoring/weights';
import './Leaderboard.css';

type Tab = 'season' | 'alltime' | 'pastWinners';

function formatWinnerName(name: string | undefined): string {
  if (!name) return 'N/A';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'N/A';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function buildMockSeasonViewership(seasonIndex: number): string {
  const viewers = 4.2 + (((seasonIndex * 13) % 33) / 10);
  return `${viewers.toFixed(1)}M viewers`;
}

function resolveWinnerName(playerId: string | undefined, displayName: string | undefined): string {
  const fullNameById = playerId ? getById(playerId)?.fullName : undefined;
  const fullNameByDisplayName = displayName ? findByName(displayName)?.fullName : undefined;
  const fullName = fullNameById ?? fullNameByDisplayName ?? displayName;
  return formatWinnerName(fullName);
}

export default function Leaderboard() {
  const navigate = useNavigate();
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
    lohWins: p.stats?.lohWins ?? 0,
    posWins: p.stats?.posWins ?? 0,
    timesNominated: p.stats?.timesNominated ?? 0,
    battleBackWins: p.stats?.battleBackWins ?? 0,
    wonFinalHoh: p.stats?.wonFinalHoh ?? false,
    // Only players with status 'jury' are actual jury members.
    // The winner (finalRank=1) and runner-up (finalRank=2) are NOT jury members
    // and should not receive the madeJury bonus.
    madeJury: p.status === 'jury',
  }));

  const seasonEntries = computeSeasonLeaderboard(liveSummaries, DEFAULT_WEIGHTS);
  const allTimeEntries = computeAllTimeLeaderboard(seasonArchives, DEFAULT_WEIGHTS);
  const pastWinners = [...seasonArchives]
    .sort((a, b) => (b.seasonIndex ?? 0) - (a.seasonIndex ?? 0))
    .map((archive) => {
      const winner = archive.playerSummaries.find((summary) => summary.finalPlacement === 1);
      return {
        seasonId: archive.seasonId,
        seasonIndex: archive.seasonIndex,
        winnerName: resolveWinnerName(winner?.playerId, winner?.displayName),
        seasonViewership: buildMockSeasonViewership(archive.seasonIndex),
      };
    });

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="placeholder-screen leaderboard-screen">
      <div className="leaderboard-screen__title-row">
        <h1 className="placeholder-screen__title">🏆 Leaderboard</h1>
        <button
          className="leaderboard-screen__back"
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
        >
          <span aria-hidden="true">↩</span>
        </button>
      </div>

      <div className="leaderboard-screen__tabs">
        <button
          type="button"
          className={`leaderboard-screen__tab game-button game-button--menu game-button--ghost${tab === 'season' ? ' leaderboard-screen__tab--active' : ''}`}
          onClick={() => setTab('season')}
        >
          This Season
        </button>
        <button
          type="button"
          className={`leaderboard-screen__tab game-button game-button--menu game-button--ghost${tab === 'alltime' ? ' leaderboard-screen__tab--active' : ''}`}
          onClick={() => setTab('alltime')}
        >
          All-Time
        </button>
        <button
          type="button"
          className={`leaderboard-screen__tab game-button game-button--menu game-button--ghost${tab === 'pastWinners' ? ' leaderboard-screen__tab--active' : ''}`}
          onClick={() => setTab('pastWinners')}
        >
          Past Winners
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
                  type="button"
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
                    {bd.lohWins > 0 && <li>LOH wins: +{bd.lohWins}</li>}
                    {bd.posWins > 0 && <li>POS wins: +{bd.posWins}</li>}
                    {bd.wonFinalHoh > 0 && <li>Final LOH: +{bd.wonFinalHoh}</li>}
                    {bd.madeJury > 0 && <li>Made tribunal: +{bd.madeJury}</li>}
                    {bd.battleBackWins > 0 && <li>Back 2 the Game win(s): +{bd.battleBackWins}</li>}
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
                  type="button"
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
                    {bd.lohWins > 0 && <li>LOH wins: +{bd.lohWins}</li>}
                    {bd.posWins > 0 && <li>POS wins: +{bd.posWins}</li>}
                    {bd.wonFinalHoh > 0 && <li>Final LOH: +{bd.wonFinalHoh}</li>}
                    {bd.madeJury > 0 && <li>Made tribunal: +{bd.madeJury}</li>}
                    {bd.battleBackWins > 0 && <li>Back 2 the Game win(s): +{bd.battleBackWins}</li>}
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

      {tab === 'pastWinners' && (
        <ul className="leaderboard-screen__list">
          {pastWinners.length === 0 && (
            <li className="leaderboard-screen__empty">No archived seasons yet.</li>
          )}
          {pastWinners.map((archive) => (
            <li key={archive.seasonId} className="leaderboard-screen__row">
              <div className="leaderboard-screen__row-main leaderboard-screen__row-main--static">
                <div className="leaderboard-screen__winner-meta">
                  <span className="leaderboard-screen__name">Season {archive.seasonIndex}</span>
                  <span className="leaderboard-screen__subtext">{archive.seasonViewership}</span>
                </div>
                <span className="leaderboard-screen__score">{archive.winnerName}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
