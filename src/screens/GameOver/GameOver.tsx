import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resetGame, archiveSeason } from '../../store/gameSlice';
import type { Player } from '../../types';
import type { SeasonArchive, PlayerSeasonSummary } from '../../store/seasonArchive';
import { computeLeaderboardScore, computeSeasonLeaderboard } from '../../scoring/computeLeaderboard';
import { computeAllTimeLeaderboard } from '../../scoring/computeAllTime';
import { DEFAULT_WEIGHTS } from '../../scoring/weights';
import './GameOver.css';

const CAROUSEL_INTERVAL_MS = 5000;

/** Build PlayerSeasonSummary array from current player state — pure (no Date.now). */
function buildSummaries(players: Player[], favoriteWinnerId: string | null): PlayerSeasonSummary[] {
  return players.map((p) => {
    // Only players with status 'jury' are actual jury members.
    // The winner (finalRank=1) and runner-up (finalRank=2) are NOT jury members
    // and should not receive the madeJury bonus.
    const madeJury = p.status === 'jury';
    const hohWins = p.stats?.hohWins ?? 0;
    const povWins = p.stats?.povWins ?? 0;
    const timesNominated = p.stats?.timesNominated ?? 0;
    const battleBackWins = p.stats?.battleBackWins ?? 0;
    const wonPublicFavorite = favoriteWinnerId != null && p.id === favoriteWinnerId;
    const wonFinalHoh = p.stats?.wonFinalHoh ?? false;

    const summary: PlayerSeasonSummary = {
      playerId: p.id,
      displayName: p.name,
      finalPlacement: p.finalRank ?? null,
      isEvicted: p.status === 'evicted' || p.status === 'jury',
      hohWins,
      povWins,
      compsWon: hohWins + povWins,
      timesNominated,
      noms: timesNominated,
      madeJury,
      battleBackWins,
      wonPublicFavorite,
      wonFinalHoh,
      leaderboardScore: 0,
    };
    summary.leaderboardScore = computeLeaderboardScore(summary, DEFAULT_WEIGHTS);
    return summary;
  });
}

/** Build a SeasonArchive from pre-computed summaries — called only from event handlers. */
function buildArchive(season: number, summaries: PlayerSeasonSummary[]): SeasonArchive {
  return {
    seasonIndex: season,
    seasonId: `season-${season}-${Date.now()}`,
    endAt: new Date().toISOString(),
    playerSummaries: summaries,
  };
}

export default function GameOver() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const players = useAppSelector((s) => s.game.players);
  const season = useAppSelector((s) => s.game.season);
  const seasonArchives = useAppSelector((s) => s.game.seasonArchives ?? []);
  const favoriteWinnerId = useAppSelector((s) => s.game.favoritePlayer?.winnerId ?? null);
  // Use a ref so the guard is synchronously readable and prevents double-archiving
  // even if the button is clicked multiple times before React re-renders.
  const archivedRef = useRef(false);

  const [carouselSlide, setCarouselSlide] = useState(0);

  const winner = players.find((p) => p.isWinner) ?? players.find((p) => p.finalRank === 1);
  const runnerUp = players.find((p) => p.finalRank === 2);

  // Compute per-player summaries (pure — no impure calls)
  const summaries = buildSummaries(players, favoriteWinnerId);

  const seasonLeaderboard = computeSeasonLeaderboard(summaries, DEFAULT_WEIGHTS).slice(0, 5);
  const allTimeLeaderboard = computeAllTimeLeaderboard(seasonArchives, DEFAULT_WEIGHTS).slice(0, 5);

  // Auto-advance carousel
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselSlide((s) => (s + 1) % 3);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  function startNewSeason() {
    if (!archivedRef.current) {
      archivedRef.current = true;
      dispatch(archiveSeason(buildArchive(season, summaries)));
    }
    dispatch(resetGame());
    navigate('/');
  }

  function exitToHome() {
    navigate('/');
  }

  return (
    <div className="gameover-shell">
      <div className="gameover-card">
        <h1 className="gameover-title">Season Complete</h1>
        <p className="gameover-sub">Thanks for playing — here are the results</p>

        {/* ── Carousel ── */}
        <div className="gameover-carousel" aria-live="polite">
          {/* Slide 0: Winner / Runner-up */}
          <div
            className={`gameover-carousel__slide${carouselSlide === 0 ? ' gameover-carousel__slide--active' : ''}`}
          >
            <div className="gameover-winner">
              <div className="gameover-winner__label">Winner</div>
              <div className="gameover-winner__name">{winner?.name ?? 'TBD'}</div>
            </div>

            {runnerUp && (
              <div className="gameover-runnerup">
                <div className="gameover-runnerup__label">Runner-up</div>
                <div className="gameover-runnerup__name">{runnerUp.name}</div>
              </div>
            )}
          </div>

          {/* Slide 1: Season top 5 */}
          <div
            className={`gameover-carousel__slide${carouselSlide === 1 ? ' gameover-carousel__slide--active' : ''}`}
          >
            <p className="gameover-carousel__heading">Season Top 5 🏆</p>
            <ul className="gameover-scoreboard">
              {seasonLeaderboard.map((entry, i) => (
                <li key={entry.playerId} className="gameover-scoreboard__row">
                  <span className="gameover-scoreboard__rank">#{i + 1}</span>
                  <span className="gameover-scoreboard__name">{entry.displayName}</span>
                  <span className="gameover-scoreboard__score">{entry.score} pts</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Slide 2: All-time top 5 */}
          <div
            className={`gameover-carousel__slide${carouselSlide === 2 ? ' gameover-carousel__slide--active' : ''}`}
          >
            <p className="gameover-carousel__heading">All-Time Top 5 🌟</p>
            <ul className="gameover-scoreboard">
              {allTimeLeaderboard.map((entry, i) => (
                <li key={entry.playerId} className="gameover-scoreboard__row">
                  <span className="gameover-scoreboard__rank">#{i + 1}</span>
                  <span className="gameover-scoreboard__name">{entry.displayName}</span>
                  <span className="gameover-scoreboard__score">{entry.totalScore} pts</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Carousel dots ── */}
        <div className="gameover-carousel__dots">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              className={`gameover-carousel__dot${carouselSlide === i ? ' gameover-carousel__dot--active' : ''}`}
              onClick={() => setCarouselSlide(i)}
              aria-label={`Show slide ${i + 1}`}
            />
          ))}
        </div>

        <div className="gameover-actions">
          <button className="gameover-btn gameover-btn--primary" onClick={startNewSeason}>
            Start New Season
          </button>
          <button className="gameover-btn gameover-btn--ghost" onClick={exitToHome}>
            Exit to Home
          </button>
        </div>
      </div>
    </div>
  );
}
