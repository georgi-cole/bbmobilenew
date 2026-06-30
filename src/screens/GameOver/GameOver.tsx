import { useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RecapImage from '../../components/SeasonRecapCinematic/RecapImage';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { resetGame, archiveSeason } from '../../store/gameSlice';
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice';
import { savedStateKeyForProfile, clearSeasonSnapshot } from '../../store/saveStatePersistence';
import type { Player } from '../../types';
import type { SeasonArchive, PlayerSeasonSummary } from '../../store/seasonArchive';
import { computeLeaderboardScore, computeSeasonLeaderboard } from '../../scoring/computeLeaderboard';
import { computeAllTimeLeaderboard } from '../../scoring/computeAllTime';
import { DEFAULT_WEIGHTS } from '../../scoring/weights';
import { SoundManager } from '../../services/sound/SoundManager';
import { buildAftermathStories } from './aftermath';
import './GameOver.css';

const CAROUSEL_INTERVAL_MS = 5000;
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;

/** Build PlayerSeasonSummary array from current player state - pure (no Date.now). */
function buildSummaries(players: Player[], favoriteWinnerId: string | null, week: number): PlayerSeasonSummary[] {
  return players.map((p) => {
    // Only players with status 'jury' are actual jury members.
    // The winner (finalRank=1) and runner-up (finalRank=2) are NOT jury members
    // and should not receive the madeJury bonus.
    const madeJury = p.status === 'jury';
    const lohWins = p.stats?.lohWins ?? 0;
    const posWins = p.stats?.posWins ?? 0;
    const timesNominated = p.stats?.timesNominated ?? 0;
    const battleBackWins = p.stats?.battleBackWins ?? 0;
    const wonPublicFavorite = favoriteWinnerId != null && p.id === favoriteWinnerId;
    const wonFinalHoh = p.stats?.wonFinalHoh ?? false;
    // The internal `week` counter now represents in-game days, so archive the
    // survival duration as daysAlive. Keep weeksAlive populated too as a
    // backwards-compatible fallback for any older consumers still reading it.
    const daysAlive = p.evictedAtWeek ?? week;
    const survivedDoubleEviction = p.stats?.survivedDoubleEviction ?? false;

    const summary: PlayerSeasonSummary = {
      playerId: p.id,
      displayName: p.name,
      finalPlacement: p.finalRank ?? null,
      isEvicted: p.status === 'evicted' || p.status === 'jury',
      lohWins,
      posWins,
      compsWon: lohWins + posWins,
      timesNominated,
      noms: timesNominated,
      madeJury,
      battleBackWins,
      wonPublicFavorite,
      wonFinalHoh,
      daysAlive,
      weeksAlive: daysAlive,
      survivedDoubleEviction: survivedDoubleEviction ? true : undefined,
      leaderboardScore: 0,
    };
    summary.leaderboardScore = computeLeaderboardScore(summary, DEFAULT_WEIGHTS);
    return summary;
  });
}

/** Build a SeasonArchive from pre-computed summaries - called only from event handlers. */
function buildArchive(season: number, summaries: PlayerSeasonSummary[]): SeasonArchive {
  return {
    seasonIndex: season,
    seasonId: `season-${season}-${Date.now()}`,
    endAt: new Date().toISOString(),
    playerSummaries: summaries,
  };
}

type GameOverPanel = 'results' | 'adPrompt' | 'aftermath';

export default function GameOver() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const players = useAppSelector((s) => s.game.players);
  const season = useAppSelector((s) => s.game.season);
  const week = useAppSelector((s) => s.game.week);
  const seasonArchives = useAppSelector((s) => s.game.seasonArchives ?? []);
  const favoriteWinnerId = useAppSelector((s) => s.game.favoritePlayer?.winnerId ?? null);
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);
  // Use a ref so the guard is synchronously readable and prevents double-archiving
  // even if the button is clicked multiple times before React re-renders.
  const archivedRef = useRef(false);

  const [carouselSlide, setCarouselSlide] = useState(0);
  const [panel, setPanel] = useState<GameOverPanel>('results');
  const [storyIndex, setStoryIndex] = useState(0);

  const winner = players.find((p) => p.isWinner) ?? players.find((p) => p.finalRank === 1);
  const runnerUp = players.find((p) => p.finalRank === 2);

  // Compute per-player summaries (pure - no impure calls)
  const summaries = buildSummaries(players, favoriteWinnerId, week);

  const seasonLeaderboard = computeSeasonLeaderboard(summaries, DEFAULT_WEIGHTS).slice(0, 5);
  const allTimeLeaderboard = computeAllTimeLeaderboard(seasonArchives, DEFAULT_WEIGHTS).slice(0, 5);
  const aftermathStories = useMemo(() => buildAftermathStories(players, season), [players, season]);
  const activeStory = aftermathStories[storyIndex] ?? aftermathStories[0];

  // Auto-advance carousel
  useEffect(() => {
    const id = setInterval(() => {
      setCarouselSlide((s) => (s + 1) % 3);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  function archiveCompletedSeason() {
    if (!archivedRef.current) {
      archivedRef.current = true;
      dispatch(archiveSeason(buildArchive(season, summaries)));
    }
  }

  function startNewSeason() {
    archiveCompletedSeason();
    // Clear any stale mid-season snapshot so the Play prompt won't offer
    // to resume an outdated save after the season has been completed.
    if (!isGuest && activeProfileId) {
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId));
    }
    dispatch(resetGame());
    SoundManager.unlockFromGesture();
    navigate('/', { state: { autoStartGame: true } });
  }

  function exitToHome() {
    archiveCompletedSeason();
    // Clear any stale mid-season snapshot so HomeHub does not offer to resume
    // a season that has already been completed.
    if (!isGuest && activeProfileId) {
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId));
    }
    dispatch(resetGame());
    navigate('/');
  }

  function openAftermathPrompt() {
    setPanel('adPrompt');
  }

  function closeOverlay() {
    setPanel('results');
    setStoryIndex(0);
  }

  function watchAd() {
    SoundManager.unlockFromGesture();
    setStoryIndex(0);
    setPanel('aftermath');
  }

  function showPreviousStory() {
    setStoryIndex((current) => Math.max(current - 1, 0));
  }

  function showNextStory() {
    if (storyIndex >= aftermathStories.length - 1) {
      closeOverlay();
      return;
    }
    setStoryIndex((current) => Math.min(current + 1, aftermathStories.length - 1));
  }

  return (
    <div className="gameover-shell">
      <div className="gameover-brand" aria-hidden="true">
        <img className="gameover-brand__logo" src={LOGO_SRC} alt="" />
      </div>

      <div className="gameover-card">
        <h1 className="gameover-title">Season Complete</h1>
        <p className="gameover-sub">Thanks for playing - here are the results</p>

        {/* -- Carousel -- */}
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
            <p className="gameover-carousel__heading">Season Top 5</p>
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
            <p className="gameover-carousel__heading">All-Time Top 5</p>
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

        {/* -- Carousel dots -- */}
        <div className="gameover-carousel__dots">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              className={`gameover-carousel__dot${carouselSlide === i ? ' gameover-carousel__dot--active' : ''}`}
              onClick={() => setCarouselSlide(i)}
              aria-label={`Show slide ${i + 1}`}
              type="button"
            />
          ))}
        </div>

        <div className="gameover-actions">
          <button className="gameover-btn gameover-btn--primary" onClick={startNewSeason} type="button">
            New Season
          </button>
          <button className="gameover-btn gameover-btn--ghost" onClick={exitToHome} type="button">
            Home
          </button>
          <button className="gameover-btn gameover-btn--accent" onClick={openAftermathPrompt} type="button">
            Aftermath
          </button>
        </div>
      </div>

      {panel !== 'results' && (
        <div className="gameover-overlay" role="dialog" aria-modal="true">
          <div className="gameover-overlay__scrim" onClick={panel === 'adPrompt' ? closeOverlay : undefined} />

          {panel === 'adPrompt' && (
            <div className="gameover-prompt">
              <p className="gameover-prompt__eyebrow">Aftermath Special</p>
              <h2 className="gameover-prompt__title">Watch a quick ad to unlock the gossip reel.</h2>
              <p className="gameover-prompt__body">
                See what happened to the housemates after the finale. For testing, tapping Watch Ad simulates a completed ad.
              </p>
              <div className="gameover-prompt__actions">
                <button className="gameover-btn gameover-btn--primary" onClick={watchAd} type="button">
                  Watch Ad
                </button>
                <button className="gameover-btn gameover-btn--ghost" onClick={closeOverlay} type="button">
                  Back
                </button>
              </div>
            </div>
          )}

          {panel === 'aftermath' && activeStory && (
            <div className={`gameover-aftermath gameover-aftermath--${activeStory.tone}`}>
              <div className="gameover-aftermath__topbar">
                <span className="gameover-aftermath__edition">Late Edition</span>
                <span className={`gameover-aftermath__tone gameover-aftermath__tone--${activeStory.tone}`}>
                  {activeStory.toneLabel}
                </span>
              </div>

              <div className="gameover-aftermath__meta">
                <div>
                  <p className="gameover-aftermath__player">{activeStory.playerName}</p>
                  <p className="gameover-aftermath__placement">{activeStory.placementLabel}</p>
                </div>
                <p className="gameover-aftermath__progress">
                  {storyIndex + 1} / {aftermathStories.length}
                </p>
              </div>

              <div className="gameover-aftermath__paper">
                <div className="gameover-aftermath__lead">
                  <p className="gameover-aftermath__kicker">What happened next</p>
                  <h2 className="gameover-aftermath__headline">{activeStory.headline}</h2>
                  <p className="gameover-aftermath__subheadline">{activeStory.subheadline}</p>
                </div>

                <div className="gameover-aftermath__story-grid">
                  <div className="gameover-aftermath__photo-panel">
                    <RecapImage
                      className="gameover-aftermath__photo"
                      sources={activeStory.imageSources}
                      alt={activeStory.playerName}
                    />
                    <p className="gameover-aftermath__caption">Exclusive post-show sighting.</p>
                  </div>

                  <div className="gameover-aftermath__copy">
                    <ul className="gameover-aftermath__bullets">
                      {activeStory.bulletPoints.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                    <p className="gameover-aftermath__body">{activeStory.body}</p>
                  </div>
                </div>
              </div>

              <div className="gameover-aftermath__actions">
                <button className="gameover-btn gameover-btn--ghost" onClick={closeOverlay} type="button">
                  Results
                </button>
                <button
                  className="gameover-btn gameover-btn--ghost"
                  onClick={showPreviousStory}
                  disabled={storyIndex === 0}
                  type="button"
                >
                  Previous
                </button>
                <button className="gameover-btn gameover-btn--primary" onClick={showNextStory} type="button">
                  {storyIndex === aftermathStories.length - 1 ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
