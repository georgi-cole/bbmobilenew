import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppSelector } from '../../store/hooks'
import { findByName, getById } from '../../data/houseguests'
import {
  buildAchievementSummary,
  findArchiveUserSummary,
} from '../../store/achievementSummary'
import type { SeasonArchive } from '../../store/seasonArchive'
import './Leaderboard.css'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'

type Tab = 'history' | 'achievements'

function resolvePlayerName(playerId: string | undefined, displayName: string | undefined): string {
  const fullNameById = playerId ? getById(playerId)?.fullName : undefined
  const fullNameByDisplayName = displayName ? findByName(displayName)?.fullName : undefined
  return fullNameById ?? fullNameByDisplayName ?? displayName ?? 'N/A'
}

function placementLabel(placement: number | null | undefined): string {
  if (placement == null || placement <= 0) return '—'
  const mod100 = placement % 100
  const mod10 = placement % 10
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : mod10 === 1
        ? 'st'
        : mod10 === 2
          ? 'nd'
          : mod10 === 3
            ? 'rd'
            : 'th'
  return `${placement}${suffix}`
}

function seasonFormatLabel(archive: SeasonArchive): string {
  if (archive.voxPopuliActivated) return 'Vox Populi'
  if (archive.cupidArrowActivated) return "Cupid's Arrow"
  return 'Classic'
}

function seasonDuration(archive: SeasonArchive): number | null {
  const durations = archive.playerSummaries
    .map((summary) => summary.daysAlive ?? summary.weeksAlive)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  if (durations.length === 0) return null
  return Math.max(...durations)
}

export default function Leaderboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('history')
  const [expandedSeasonId, setExpandedSeasonId] = useState<string | null>(null)
  const players = useAppSelector((state) => state.game.players)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const seasonArchives = useAppSelector((state) => state.game.seasonArchives ?? [])
  const userPlayer = players.find((player) => player.isUser) ?? null

  const seasonHistory = useMemo(
    () =>
      [...seasonArchives]
        .sort((left, right) => (right.seasonIndex ?? 0) - (left.seasonIndex ?? 0))
        .map((archive) => {
          const winner = archive.playerSummaries.find((summary) => summary.finalPlacement === 1)
          const runnerUp = archive.playerSummaries.find((summary) => summary.finalPlacement === 2)
          const publicFavorite = archive.playerSummaries.find((summary) => summary.wonPublicFavorite)
          const userSummary = findArchiveUserSummary(archive, userPlayer)
          const duration = seasonDuration(archive)
          return {
            archive,
            winnerName: resolvePlayerName(winner?.playerId, winner?.displayName),
            runnerUpName: resolvePlayerName(runnerUp?.playerId, runnerUp?.displayName),
            publicFavoriteName: publicFavorite
              ? resolvePlayerName(publicFavorite.playerId, publicFavorite.displayName)
              : '—',
            userSummary,
            duration,
            formatLabel: seasonFormatLabel(archive),
          }
        }),
    [seasonArchives, userPlayer]
  )

  const achievementSummary = useMemo(
    () =>
      buildAchievementSummary({
        userPlayer,
        seasonArchives,
        day: week,
        phase,
      }),
    [phase, seasonArchives, userPlayer, week]
  )

  return (
    <div className="placeholder-screen hall-of-fame-screen">
      <div className="hall-of-fame-screen__title-row">
        <h1 className="placeholder-screen__title">🏆 Hall of Fame</h1>
        <GameBackButton className="hall-of-fame-screen__back" onClick={() => navigate(-1)} />
      </div>

      <div className="hall-of-fame-screen__tabs" role="tablist" aria-label="Hall of Fame">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`hall-of-fame-screen__tab game-button game-button--menu game-button--ghost${tab === 'history' ? ' hall-of-fame-screen__tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          Season History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'achievements'}
          className={`hall-of-fame-screen__tab game-button game-button--menu game-button--ghost${tab === 'achievements' ? ' hall-of-fame-screen__tab--active' : ''}`}
          onClick={() => setTab('achievements')}
        >
          Achievements
        </button>
      </div>

      {tab === 'history' && (
        <section className="hall-of-fame-screen__panel" aria-label="Season history">
          {seasonHistory.length === 0 ? (
            <div className="hall-of-fame-screen__empty">
              <strong>No completed seasons yet.</strong>
              <span>Your winners and season finishes will appear here.</span>
            </div>
          ) : (
            <ul className="hall-of-fame-screen__season-list">
              {seasonHistory.map(
                ({
                  archive,
                  winnerName,
                  runnerUpName,
                  publicFavoriteName,
                  userSummary,
                  duration,
                  formatLabel,
                }) => {
                  const isExpanded = expandedSeasonId === archive.seasonId
                  const userTitles = userSummary?.titlesWon?.filter(Boolean) ?? []
                  return (
                    <li key={archive.seasonId} className="hall-of-fame-screen__season-card">
                      <button
                        type="button"
                        className="hall-of-fame-screen__season-main"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedSeasonId((current) =>
                            current === archive.seasonId ? null : archive.seasonId
                          )
                        }
                      >
                        <span className="hall-of-fame-screen__season-copy">
                          <span className="hall-of-fame-screen__season-heading">
                            Season {archive.seasonIndex}
                          </span>
                          <span className="hall-of-fame-screen__season-meta">
                            {formatLabel}
                            {archive.twinShockConsumed ? ' · Twin Shock' : ''}
                            {duration ? ` · ${duration} days` : ''}
                          </span>
                          <span className="hall-of-fame-screen__your-finish">
                            You: {placementLabel(userSummary?.finalPlacement)}
                          </span>
                        </span>
                        <span className="hall-of-fame-screen__winner-block">
                          <span className="hall-of-fame-screen__winner-label">Winner</span>
                          <span className="hall-of-fame-screen__winner-name">🏆 {winnerName}</span>
                        </span>
                        <span className="hall-of-fame-screen__chevron" aria-hidden="true">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="hall-of-fame-screen__season-details">
                          <dl className="hall-of-fame-screen__detail-grid">
                            <div>
                              <dt>Winner</dt>
                              <dd>{winnerName}</dd>
                            </div>
                            <div>
                              <dt>Runner-up</dt>
                              <dd>{runnerUpName}</dd>
                            </div>
                            <div>
                              <dt>Public Favorite</dt>
                              <dd>{publicFavoriteName}</dd>
                            </div>
                            <div>
                              <dt>Your finish</dt>
                              <dd>{placementLabel(userSummary?.finalPlacement)}</dd>
                            </div>
                          </dl>
                          {userTitles.length > 0 && (
                            <div className="hall-of-fame-screen__season-titles">
                              <span>Your season titles</span>
                              <div>
                                {userTitles.map((title) => (
                                  <span key={title} className="hall-of-fame-screen__badge">
                                    {title.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                }
              )}
            </ul>
          )}
        </section>
      )}

      {tab === 'achievements' && (
        <section className="hall-of-fame-screen__panel hall-of-fame-screen__achievements" aria-label="Achievements">
          <div className="hall-of-fame-screen__achievement-intro">
            <div>
              <span className="hall-of-fame-screen__eyebrow">Career legacy</span>
              <h2>{achievementSummary.playerName}&apos;s trophy case</h2>
            </div>
            <span className="hall-of-fame-screen__achievement-count">
              {achievementSummary.highlightBadges.length} badges
            </span>
          </div>

          <div className="hall-of-fame-screen__featured-grid">
            {achievementSummary.featuredStats.map((stat) => (
              <article
                key={stat.label}
                className={`hall-of-fame-screen__achievement-card hall-of-fame-screen__achievement-card--${stat.tone}${stat.wide ? ' hall-of-fame-screen__achievement-card--wide' : ''}`}
              >
                <span className="hall-of-fame-screen__achievement-icon" aria-hidden="true">
                  {stat.icon}
                </span>
                <span className="hall-of-fame-screen__achievement-value">{stat.value}</span>
                <span className="hall-of-fame-screen__achievement-label">{stat.label}</span>
                {stat.helper && (
                  <span className="hall-of-fame-screen__achievement-helper">{stat.helper}</span>
                )}
              </article>
            ))}
          </div>

          <div className="hall-of-fame-screen__badge-section">
            <h3>Badges</h3>
            {achievementSummary.highlightBadges.length > 0 ? (
              <div className="hall-of-fame-screen__badges">
                {achievementSummary.highlightBadges.map((badge) => (
                  <span key={badge} className="hall-of-fame-screen__badge">
                    {badge}
                  </span>
                ))}
              </div>
            ) : (
              <p>Finish a season or hit a career milestone to start your badge collection.</p>
            )}
          </div>

          <div className="hall-of-fame-screen__achievement-sections">
            {achievementSummary.sections.map((section) => (
              <section key={section.title} className="hall-of-fame-screen__achievement-section">
                <h3>
                  <span aria-hidden="true">{section.icon}</span> {section.title}
                </h3>
                <div className="hall-of-fame-screen__stat-grid">
                  {section.stats.map((stat) => (
                    <div key={stat.label} className="hall-of-fame-screen__stat">
                      <span aria-hidden="true">{stat.icon}</span>
                      <strong>{stat.value}</strong>
                      <small>{stat.label}</small>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
