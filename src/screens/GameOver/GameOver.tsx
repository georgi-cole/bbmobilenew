import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import RecapImage from '../../components/SeasonRecapCinematic/RecapImage'
import { preloadRecapImageSources } from '../../components/SeasonRecapCinematic/recapImagePreload'
import { buildSeasonRecapData } from '../../components/SeasonRecapCinematic/seasonRecapData'
import type { PublicOpinionState } from '../../publicOpinion/types'
import { computeAllTimeLeaderboard } from '../../scoring/computeAllTime'
import { computeLeaderboardScore, computeSeasonLeaderboard } from '../../scoring/computeLeaderboard'
import { DEFAULT_WEIGHTS } from '../../scoring/weights'
import { SoundManager } from '../../services/sound/SoundManager'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { resetGame, archiveSeason } from '../../store/gameSlice'
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice'
import { savedStateKeyForProfile, clearSeasonSnapshot } from '../../store/saveStatePersistence'
import type { SeasonArchive, PlayerSeasonSummary } from '../../store/seasonArchive'
import type { Player } from '../../types'
import { resolveAvatarCandidates } from '../../utils/avatar'
import {
  aftermathIssueStorageKey,
  buildAftermathIssue,
  getBundledAftermathConfig,
  loadAftermathConfig,
  persistAftermathIssue,
  readPersistedAftermathIssue,
  type AftermathIssue,
} from './aftermath'
import './GameOver.css'
import './AftermathTabloid.css'

const CAROUSEL_INTERVAL_MS = 5000
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`
// i18n-ignore: Internal TypeScript property name; this identifier is never rendered to players.
const EMPTY_AFTERMATH_STORIES: AftermathIssue['stories'] = []

function buildTitleMap(
  players: Player[],
  week: number,
  publicOpinion: PublicOpinionState | null | undefined
): Map<string, string[]> {
  const titlesByPlayerId = new Map<string, string[]>()
  buildSeasonRecapData(players, week, publicOpinion).categories.forEach((category) => {
    const existing = titlesByPlayerId.get(category.winner.id) ?? []
    existing.push(category.name)
    titlesByPlayerId.set(category.winner.id, existing)
  })
  return titlesByPlayerId
}

function buildSummaries(
  players: Player[],
  favoriteWinnerId: string | null,
  week: number,
  publicOpinion: PublicOpinionState | null | undefined
): PlayerSeasonSummary[] {
  const titlesByPlayerId = buildTitleMap(players, week, publicOpinion)

  return players.map((p) => {
    const madeJury = p.status === 'jury'
    const lohWins = p.stats?.lohWins ?? 0
    const posWins = p.stats?.posWins ?? 0
    const timesNominated = p.stats?.timesNominated ?? 0
    const battleBackWins = p.stats?.battleBackWins ?? 0
    const wonPublicFavorite = favoriteWinnerId != null && p.id === favoriteWinnerId
    const wonFinalHoh = p.stats?.wonFinalHoh ?? false
    const daysAlive = p.evictedAtWeek ?? week
    const survivedDoubleEviction = p.stats?.survivedDoubleEviction ?? false

    const summary: PlayerSeasonSummary = {
      playerId: p.id,
      displayName: p.name,
      finalPlacement: p.finalRank ?? p.seasonPlacement ?? null,
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
      finalPublicApproval: publicOpinion?.profiles[p.id]?.approval,
      titlesWon: titlesByPlayerId.get(p.id) ?? [],
      leaderboardScore: 0,
    }
    summary.leaderboardScore = computeLeaderboardScore(summary, DEFAULT_WEIGHTS)
    return summary
  })
}

function buildArchive(
  season: number,
  summaries: PlayerSeasonSummary[],
  cupidArrowActivated: boolean,
  voxPopuliActivated: boolean
): SeasonArchive {
  return {
    seasonIndex: season,
    seasonId: `season-${season}-${Date.now()}`,
    endAt: new Date().toISOString(),
    playerSummaries: summaries,
    cupidArrowActivated,
    voxPopuliActivated,
  }
}

type GameOverPanel = 'results' | 'adPrompt' | 'aftermath'

export default function GameOver() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const players = useAppSelector((s) => s.game.players)
  const gameId = useAppSelector((s) => s.game.gameId)
  const season = useAppSelector((s) => s.game.season)
  const week = useAppSelector((s) => s.game.week)
  const cupidArrowActivated = useAppSelector(
    (s) => s.game.cupidArrow?.activatedSeason === s.game.season
  )
  const voxPopuliActivated = useAppSelector(
    (s) => s.game.voxPopuli?.activatedSeason === s.game.season
  )
  const seasonArchives = useAppSelector((s) => s.game.seasonArchives ?? [])
  const favoriteWinnerId = useAppSelector((s) => s.game.favoritePlayer?.winnerId ?? null)
  const social = useAppSelector((s) => s.game.social)
  const history = useAppSelector((s) => s.game.history ?? [])
  const publicOpinion = useAppSelector((s) => s.publicOpinion)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const archivedRef = useRef(false)
  const aftermathStoryRequestRef = useRef(0)

  const [carouselSlide, setCarouselSlide] = useState(0)
  const [panel, setPanel] = useState<GameOverPanel>('results')
  const [storyIndex, setStoryIndex] = useState(0)
  const [aftermathIssue, setAftermathIssue] = useState<AftermathIssue | null>(null)
  const [isAftermathLoading, setIsAftermathLoading] = useState(false)
  const [isAftermathStoryLoading, setIsAftermathStoryLoading] = useState(false)

  const winner = players.find((p) => p.isWinner) ?? players.find((p) => p.finalRank === 1)
  const runnerUp = players.find((p) => p.finalRank === 2)
  const favoriteWinner = players.find((p) => p.id === favoriteWinnerId)
  const summaries = buildSummaries(players, favoriteWinnerId, week, publicOpinion)
  const seasonLeaderboard = computeSeasonLeaderboard(summaries, DEFAULT_WEIGHTS).slice(0, 5)
  const allTimeLeaderboard = computeAllTimeLeaderboard(seasonArchives, DEFAULT_WEIGHTS).slice(0, 5)
  const issueStorageKey = useMemo(
    () => aftermathIssueStorageKey(activeProfileId, gameId, season),
    [activeProfileId, gameId, season]
  )
  const editorial = aftermathIssue?.editorial ?? getBundledAftermathConfig().editorial
  const aftermathStories = aftermathIssue?.stories ?? EMPTY_AFTERMATH_STORIES
  const activeStory = aftermathStories[storyIndex] ?? aftermathStories[0]
  const aftermathProgress =
    aftermathStories.length > 0 ? ((storyIndex + 1) / aftermathStories.length) * 100 : 0

  useEffect(() => {
    const id = setInterval(() => {
      setCarouselSlide((s) => (s + 1) % 3)
    }, CAROUSEL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setAftermathIssue(readPersistedAftermathIssue(issueStorageKey))
    void loadAftermathConfig()
  }, [issueStorageKey])

  useEffect(() => {
    if (panel !== 'aftermath') return
    const nextStory = aftermathStories[storyIndex + 1]
    if (nextStory) void preloadRecapImageSources(nextStory.imageSources)
  }, [aftermathStories, panel, storyIndex])

  function archiveCompletedSeason() {
    if (!archivedRef.current) {
      archivedRef.current = true
      dispatch(
        archiveSeason(
          buildArchive(season, summaries, cupidArrowActivated, voxPopuliActivated)
        )
      )
    }
  }

  function startNewSeason() {
    archiveCompletedSeason()
    if (!isGuest && activeProfileId) {
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId))
    }
    dispatch(resetGame())
    SoundManager.unlockFromGesture()
    navigate('/', { state: { autoStartGame: true } })
  }

  function exitToHome() {
    archiveCompletedSeason()
    if (!isGuest && activeProfileId) {
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId))
    }
    dispatch(resetGame())
    navigate('/')
  }

  function openAftermathPrompt() {
    setPanel('adPrompt')
  }

  function closeOverlay() {
    aftermathStoryRequestRef.current += 1
    setIsAftermathStoryLoading(false)
    setPanel('results')
    setStoryIndex(0)
  }

  async function watchAd() {
    if (isAftermathLoading) return
    SoundManager.unlockFromGesture()
    setIsAftermathLoading(true)

    try {
      let issue = readPersistedAftermathIssue(issueStorageKey)
      if (!issue) {
        const config = await loadAftermathConfig()
        issue = buildAftermathIssue(
          players,
          season,
          {
            gameId,
            week,
            favoriteWinnerId,
            publicOpinion,
            social,
            history,
          },
          config
        )
        persistAftermathIssue(issueStorageKey, issue)
      }

      setAftermathIssue(issue)
      setStoryIndex(0)
      setPanel('aftermath')

      const firstStory = issue.stories[0]
      if (firstStory) void preloadRecapImageSources(firstStory.imageSources)
      const nextStory = issue.stories[1]
      if (nextStory) void preloadRecapImageSources(nextStory.imageSources)
    } finally {
      setIsAftermathLoading(false)
    }
  }

  function selectAftermathStory(index: number) {
    const targetStory = aftermathStories[index]
    if (!targetStory || index === storyIndex || isAftermathStoryLoading) return

    setStoryIndex(index)
    void preloadRecapImageSources(targetStory.imageSources)
  }

  function showPreviousStory() {
    selectAftermathStory(Math.max(storyIndex - 1, 0))
  }

  function showNextStory() {
    if (storyIndex >= aftermathStories.length - 1) {
      closeOverlay()
      return
    }
    selectAftermathStory(Math.min(storyIndex + 1, aftermathStories.length - 1))
  }

  return (
    <div className="gameover-shell">
      <div className="gameover-gallery-bg" aria-hidden="true" />
      <div className="gameover-gallery-flashes" aria-hidden="true" />
      <div className="gameover-card">
        <p className="gameover-eyebrow">Season {season} · Official record</p>
        <h1 className="gameover-title">Season Complete</h1>
        <p className="gameover-sub">The hub is closed. The record is permanent.</p>

        <div className="gameover-carousel" aria-live="polite">
          <div
            className={`gameover-carousel__slide${carouselSlide === 0 ? ' gameover-carousel__slide--active' : ''}`}
          >
            <div className="gameover-champion-record">
              <div className="gameover-champion-record__identity">
                <div className="gameover-winner__label">Season champion</div>
                <div className="gameover-winner__name">{winner?.name ?? 'TBD'}</div>
              </div>
              <div className="gameover-champion-record__showpiece">
                <div className="gameover-champion-record__portrait" aria-hidden="true">
                  {winner && (
                    <RecapImage
                      sources={resolveAvatarCandidates(winner)}
                      alt={winner.name}
                      className="gameover-champion-record__image"
                      loading="eager"
                    />
                  )}
                </div>
                <span className="gameover-champion-record__trophy" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M6 2h12v3h4v3a6 6 0 0 1-5.24 5.95A7 7 0 0 1 13 17.92V20h4v2H7v-2h4v-2.08a7 7 0 0 1-3.76-3.97A6 6 0 0 1 2 8V5h4V2Zm12 5v4.72A4 4 0 0 0 20 8V7h-2ZM4 7v1a4 4 0 0 0 2 3.72V7H4Z" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="gameover-honors-row">
              {runnerUp && (
                <div className="gameover-runnerup">
                  <div className="gameover-runnerup__label">Runner-up</div>
                  <div className="gameover-runnerup__name">{runnerUp.name}</div>
                </div>
              )}
              {favoriteWinner && (
                <div className="gameover-favorite">
                  <div className="gameover-runnerup__label">Public favorite</div>
                  <div className="gameover-runnerup__name">{favoriteWinner.name}</div>
                </div>
              )}
            </div>
          </div>

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
            <img className="gameover-record-logo" src={LOGO_SRC} alt="KoleQuant" />
          </div>

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
            <img className="gameover-record-logo" src={LOGO_SRC} alt="KoleQuant" />
          </div>
        </div>

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
          <button
            className="gameover-btn gameover-btn--primary"
            onClick={startNewSeason}
            type="button"
          >
            New Season
          </button>
          <button className="gameover-btn gameover-btn--ghost" onClick={exitToHome} type="button">
            Home
          </button>
          <button
            className="gameover-btn gameover-btn--accent"
            onClick={openAftermathPrompt}
            type="button"
          >
            Aftermath
          </button>
        </div>
      </div>

      {panel !== 'results' && (
        <div className="gameover-overlay" role="dialog" aria-modal="true">
          <div
            className="gameover-overlay__scrim"
            onClick={panel === 'adPrompt' ? closeOverlay : undefined}
          />

          {panel === 'adPrompt' && (
            <div className="gameover-prompt gameover-prompt--aftermath">
              <p className="gameover-prompt__eyebrow">Aftermath Special</p>
              <h2 className="gameover-prompt__title">The cameras stopped. The scandals did not.</h2>
              <p className="gameover-prompt__body">{editorial.intro}</p>
              <p className="gameover-prompt__fineprint">
                Watch a quick ad to unlock this season&apos;s fictional tabloid edition.
              </p>
              <div className="gameover-prompt__actions">
                <button
                  className="gameover-btn gameover-btn--primary"
                  onClick={() => void watchAd()}
                  disabled={isAftermathLoading}
                  type="button"
                >
                  {isAftermathLoading ? editorial.loadingLabel : 'Watch Ad'}
                </button>
                <button
                  className="gameover-btn gameover-btn--ghost"
                  onClick={closeOverlay}
                  disabled={isAftermathLoading}
                  type="button"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {panel === 'aftermath' && activeStory && aftermathIssue && (
            <div
              key={activeStory.playerId}
              className={`gameover-aftermath gameover-aftermath--${activeStory.tone}`}
            >
              {isAftermathStoryLoading && (
                <div className="gameover-aftermath__loading" role="status" aria-live="polite">
                  <span className="gameover-aftermath__loading-spinner" aria-hidden="true" />
                  <strong>{editorial.loadingLabel}</strong>
                </div>
              )}
              <div className="gameover-aftermath__topbar">
                <span className="gameover-aftermath__edition">{editorial.editionLabel}</span>
                <span className="gameover-aftermath__masthead">{editorial.publicationName}</span>
                <span className="gameover-aftermath__issue">
                  {editorial.issuePrefix} {aftermathIssue.issueNumber}
                </span>
              </div>

              <div className="gameover-aftermath__progress-rail" aria-hidden="true">
                <span style={{ width: `${aftermathProgress}%` }} />
              </div>

              <div className="gameover-aftermath__scroll">
                <article className="gameover-aftermath__paper">
                  <header className="gameover-aftermath__newspaper-header">
                    <div className="gameover-aftermath__dateline">
                      <span>{aftermathIssue.dateLabel}</span>
                      <span>{editorial.price}</span>
                    </div>
                    <h2>{editorial.publicationName}</h2>
                    <p>{editorial.slogan}</p>
                  </header>

                  <div className="gameover-aftermath__story-meta">
                    <span className="gameover-aftermath__category">
                      {activeStory.categoryLabel}
                    </span>
                    <span className="gameover-aftermath__badge">{activeStory.badge}</span>
                    <span
                      className={`gameover-aftermath__tone gameover-aftermath__tone--${activeStory.tone}`}
                    >
                      {activeStory.toneLabel}
                    </span>
                  </div>

                  <div className="gameover-aftermath__lead">
                    <p className="gameover-aftermath__kicker">{editorial.sectionLabel}</p>
                    <h3 className="gameover-aftermath__headline">{activeStory.headline}</h3>
                    <p className="gameover-aftermath__subheadline">{activeStory.subheadline}</p>
                  </div>

                  <div className="gameover-aftermath__story-grid">
                    <div className="gameover-aftermath__photo-panel">
                      <div className="gameover-aftermath__photo-frame">
                        {activeStory.imageSources.length > 0 ? (
                          <RecapImage
                            className="gameover-aftermath__photo"
                            sources={activeStory.imageSources}
                            alt={activeStory.playerName}
                            loading="eager"
                            decoding="async"
                          />
                        ) : (
                          <div
                            className="gameover-aftermath__photo gameover-aftermath__photo--silhouette"
                            role="img"
                            aria-label={`${activeStory.playerName} silhouette`}
                          >
                            <span aria-hidden="true" />
                          </div>
                        )}
                        <span className="gameover-aftermath__exclusive">
                          {editorial.exclusiveLabel}
                        </span>
                        <span className="gameover-aftermath__flash" aria-hidden="true" />
                      </div>
                      <p className="gameover-aftermath__caption">{activeStory.caption}</p>
                    </div>

                    <div className="gameover-aftermath__copy">
                      <div className="gameover-aftermath__byline">
                        <strong>{activeStory.playerName}</strong>
                        <span>{activeStory.placementLabel}</span>
                      </div>
                      <p className="gameover-aftermath__body">{activeStory.body}</p>
                      <ul className="gameover-aftermath__bullets">
                        {[...new Set(activeStory.bulletPoints)].map((bullet, index) => (
                          <li key={`${activeStory.playerId}-${index}`}>{bullet}</li>
                        ))}
                      </ul>
                      <aside className="gameover-aftermath__twist">
                        <span>Final twist</span>
                        <strong>{activeStory.twist}</strong>
                      </aside>
                    </div>
                  </div>

                  <footer className="gameover-aftermath__paper-footer">
                    <span>
                      {storyIndex + 1} of {aftermathStories.length}
                    </span>
                    <span>{editorial.closingLine}</span>
                  </footer>
                </article>

                <div className="gameover-aftermath__contact-sheet" aria-label="Aftermath stories">
                  {aftermathStories.map((story, index) => (
                    <button
                      key={story.playerId}
                      className={index === storyIndex ? 'is-active' : ''}
                      onClick={() => void selectAftermathStory(index)}
                      aria-label={`Open ${story.playerName}'s aftermath story`}
                      aria-current={index === storyIndex ? 'page' : undefined}
                      title={story.playerName}
                      type="button"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="gameover-aftermath__actions">
                <button
                  className="gameover-btn gameover-btn--ghost"
                  onClick={closeOverlay}
                  type="button"
                >
                  Results
                </button>
                <button
                  className="gameover-btn gameover-btn--ghost"
                  onClick={showPreviousStory}
                  disabled={storyIndex === 0 || isAftermathStoryLoading}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="gameover-btn gameover-btn--primary"
                  onClick={showNextStory}
                  disabled={isAftermathStoryLoading}
                  type="button"
                >
                  {storyIndex === aftermathStories.length - 1 ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
