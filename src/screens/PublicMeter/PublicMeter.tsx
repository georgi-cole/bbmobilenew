import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAppSelector } from '../../store/hooks'
import {
  selectPublicOpinion,
  selectRankedProfiles,
  selectPublicFeed,
  selectAllDirections,
  publicOpinionConfig,
  type PublicDirection,
} from '../../publicOpinion'
import type { Player } from '../../types'
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar'
import './PublicMeter.css'

const DICEBEAR_HOST = 'dicebear.com'
type PublicMeterTab = 'overview' | 'requests'

function isDicebearAvatarUrl(candidateUrl: string): boolean {
  try {
    const parsedUrl = new URL(candidateUrl, 'https://bbmobilenew.local')
    return parsedUrl.hostname === DICEBEAR_HOST || parsedUrl.hostname.endsWith(`.${DICEBEAR_HOST}`)
  } catch {
    return false
  }
}

function getApprovalBand(approval: number): string {
  for (const band of publicOpinionConfig.approvalBands) {
    if (approval >= band.min && approval <= band.max) return band.label
  }
  return 'mixed'
}

function isInactivePlayer(player?: Player): boolean {
  return player?.status === 'evicted' || player?.status === 'jury'
}

function getTrend(
  current: number,
  previous: number
): { symbol: string; className: string; diff: number } {
  const diff = current - previous
  if (diff > 0) return { symbol: '↑', className: 'trend--up', diff }
  if (diff < 0) return { symbol: '↓', className: 'trend--down', diff }
  return { symbol: '→', className: 'trend--neutral', diff }
}

function getFeedSignal(delta: number): { symbol: string; className: string; label: string } {
  if (delta >= 5) {
    return {
      symbol: '↑↑',
      className: 'feed-entry__signal feed-entry__signal--strong-up',
      label: 'big rise',
    }
  }
  if (delta > 0) {
    return {
      symbol: '↗',
      className: 'feed-entry__signal feed-entry__signal--up',
      label: 'modest rise',
    }
  }
  if (delta <= -3) {
    return {
      symbol: '↓↓',
      className: 'feed-entry__signal feed-entry__signal--strong-down',
      label: 'big dip',
    }
  }
  if (delta < 0) {
    return {
      symbol: '↘',
      className: 'feed-entry__signal feed-entry__signal--down',
      label: 'modest dip',
    }
  }
  return {
    symbol: '→',
    className: 'feed-entry__signal feed-entry__signal--neutral',
    label: 'steady',
  }
}

function getApprovalToneClass(approval: number): string {
  if (approval >= 75) return 'approval-bar__fill--high'
  if (approval >= 40) return 'approval-bar__fill--mid'
  return 'approval-bar__fill--low'
}

function getDirectionSignal(direction: PublicDirection): { text: string; className: string } {
  if (direction.status === 'completed') {
    return { text: 'crowd loved it ↑↑', className: 'trend--up' }
  }
  if (direction.status === 'failed') {
    return { text: 'missed the moment ↘', className: 'trend--down-soft' }
  }
  if (direction.status === 'expired') {
    return { text: 'window closed →', className: 'trend--neutral' }
  }
  return { text: 'upside with viewers ↗', className: 'trend--up-soft' }
}

function getDirectionWindowLabel(direction: PublicDirection): string {
  if (direction.status === 'completed' && direction.completedWeek) {
    return `Day ${direction.createdWeek}–${direction.completedWeek}`
  }
  return `Open through day ${direction.expiresAtWeek}`
}

function formatStatus(status: PublicDirection['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function stableTargetIndex(seed: string, length: number): number {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % Math.max(1, length)
}

function getDirectionDescription(
  direction: PublicDirection,
  players: readonly Player[],
  currentLohId?: string | null
): string {
  if (direction.type !== 'influence_hoh') return direction.description
  const activeCandidates = players.filter(
    (player) =>
      player.status !== 'evicted' &&
      player.status !== 'jury' &&
      player.id !== direction.playerId &&
      player.id !== direction.relatedPlayerId
  )
  const fallbackTarget =
    activeCandidates[stableTargetIndex(direction.id, activeCandidates.length)] ??
    players.find(
      (player) =>
        player.status !== 'evicted' && player.status !== 'jury' && player.id !== direction.playerId
    )
  const target = players.find((player) => player.id === direction.targetPlayerId) ?? fallbackTarget
  const loh =
    players.find((player) => player.id === direction.relatedPlayerId) ??
    players.find((player) => player.id === currentLohId) ??
    players.find((player) => player.status.includes('loh'))
  const lohName = loh?.name ?? 'the LOH'
  return target
    ? `Convince ${lohName} to nominate ${target.name}.`
    : `Convince ${lohName} to nominate a specific housemate.`
}

function PublicMeterAvatar({
  player,
  inactive = false,
  size = 'md',
}: {
  player?: Player
  inactive?: boolean
  size?: 'sm' | 'md'
}) {
  const candidates = useMemo(() => {
    if (!player) return []
    return resolveAvatarCandidates(player).filter(
      (candidateUrl) => !isDicebearAvatarUrl(candidateUrl)
    )
  }, [player])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [showFallback, setShowFallback] = useState(false)

  if (!player) {
    return (
      <span
        className={`public-meter-avatar public-meter-avatar--${size} public-meter-avatar--fallback`}
      >
        🧑
      </span>
    )
  }

  const fallbackText = isEmoji(player.avatar ?? '')
    ? player.avatar
    : player.name.charAt(0).toUpperCase()

  const avatarSrc = candidates[candidateIndex]

  return (
    <span
      className={`public-meter-avatar public-meter-avatar--${size}${inactive ? ' public-meter-avatar--inactive' : ''}`}
      aria-hidden="true"
    >
      {showFallback || !avatarSrc ? (
        <span className="public-meter-avatar__fallback">{fallbackText}</span>
      ) : (
        <img
          className="public-meter-avatar__img"
          src={avatarSrc}
          alt=""
          onError={() => {
            if (candidateIndex < candidates.length - 1) {
              setCandidateIndex((value) => value + 1)
            } else {
              setShowFallback(true)
            }
          }}
        />
      )}
    </span>
  )
}

export default function PublicMeter() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const rankedProfiles = useAppSelector(selectRankedProfiles)
  const feed = useAppSelector(selectPublicFeed)
  const allDirections = useAppSelector(selectAllDirections)

  const game = useAppSelector((s) => s.game)
  const userPlayer = game.players.find((p) => p.isUser)
  const userProfile = userPlayer ? publicOpinion.profiles[userPlayer.id] : undefined
  const userFeed = useMemo(
    () => (userPlayer ? feed.filter((entry) => entry.playerId === userPlayer.id).slice(0, 4) : []),
    [feed, userPlayer]
  )
  const userActiveDirections = useMemo(
    () =>
      userPlayer
        ? allDirections.filter(
            (direction) => direction.playerId === userPlayer.id && direction.status === 'active'
          )
        : [],
    [allDirections, userPlayer]
  )
  const userActiveRequestCount = useMemo(
    () =>
      userPlayer
        ? allDirections.filter(
            (direction) => direction.playerId === userPlayer.id && direction.status === 'active'
          ).length
        : 0,
    [allDirections, userPlayer]
  )

  const hasProfiles = Object.keys(publicOpinion.profiles).length > 0
  const activePlayerIds = useMemo(
    () =>
      new Set(
        game.players.filter((player) => !isInactivePlayer(player)).map((player) => player.id)
      ),
    [game.players]
  )

  const directionGroups = useMemo(
    () =>
      [
        { key: 'active', label: 'Active now' },
        { key: 'completed', label: 'Completed' },
        { key: 'failed', label: 'Missed' },
        { key: 'expired', label: 'Expired' },
      ].map((group) => ({
        ...group,
        items: allDirections
          .filter(
            (direction) => direction.status === group.key && activePlayerIds.has(direction.playerId)
          )
          .sort((left, right) => right.createdWeek - left.createdWeek),
      })),
    [activePlayerIds, allDirections]
  )
  const requestedTab = searchParams.get('tab')
  const activeTab: PublicMeterTab = requestedTab === 'requests' ? 'requests' : 'overview'

  function handleTabChange(tab: PublicMeterTab) {
    if (tab === 'overview') {
      setSearchParams({})
      return
    }
    setSearchParams({ tab: 'requests' })
  }

  if (!hasProfiles) {
    return (
      <div className="public-meter">
        <div className="public-meter__header">
          <button
            className="public-meter__back-btn"
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            ← Back
          </button>
          <h1 className="public-meter__title">📊 Public Meter</h1>
        </div>
        <div className="public-meter__empty">
          <p>
            Public opinion data is not available yet. Start a game to see how the public views you
            and the rest!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="public-meter">
      <div className="public-meter__header">
        <button
          className="public-meter__back-btn"
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>
        <div className="public-meter__title-wrap">
          <h1 className="public-meter__title">📊 Public Meter</h1>
          <span className="public-meter__subtitle">The audience is always watching.</span>
        </div>
      </div>

      <div className="public-meter__tabs" role="tablist" aria-label="Public meter views">
        <button
          className={`public-meter__tab${activeTab === 'overview' ? ' public-meter__tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => handleTabChange('overview')}
        >
          Public Meter
        </button>
        <button
          className={`public-meter__tab${activeTab === 'requests' ? ' public-meter__tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'requests'}
          onClick={() => handleTabChange('requests')}
        >
          Public Requests
          {userActiveRequestCount > 0 && (
            <span className="public-meter__tab-badge" aria-hidden="true">
              {userActiveRequestCount > 99 ? '99+' : userActiveRequestCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'overview' && userProfile && userPlayer && (
        <div className="public-meter__section public-meter__section--hero">
          <div className="public-meter__hero-head">
            <div className="public-meter__hero-player">
              <PublicMeterAvatar player={userPlayer} size="md" />
              <div>
                <h2 className="public-meter__section-title">Your Approval</h2>
                <p className="public-meter__section-caption">
                  How the outside world feels right now.
                </p>
              </div>
            </div>
            {isInactivePlayer(userPlayer) && (
              <span className="public-meter__status-pill public-meter__status-pill--inactive">
                {userPlayer.status === 'jury' ? 'Tribunal phase' : 'Out of game'}
              </span>
            )}
          </div>
          <div className="approval-bar">
            <div
              className={`approval-bar__fill ${getApprovalToneClass(userProfile.approval)}`}
              style={{ width: `${userProfile.approval}%` }}
              role="progressbar"
              aria-label="Your public approval rating"
              aria-valuenow={userProfile.approval}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="approval-bar__info">
            <span className="approval-bar__percent">{userProfile.approval}%</span>
            {(() => {
              const trend = getTrend(userProfile.approval, userProfile.previousApproval)
              return (
                <span className={`approval-bar__trend ${trend.className}`}>
                  {trend.symbol}
                  {trend.diff !== 0 ? ` ${trend.diff > 0 ? '+' : ''}${trend.diff}` : ''}
                </span>
              )
            })()}
            <span className="approval-bar__band">{getApprovalBand(userProfile.approval)}</span>
          </div>
          <details className="public-meter__explain">
            <summary>What changed</summary>
            <div className="public-meter__explain-body">
              {userFeed.length > 0 ? (
                <div className="public-meter__cause-list">
                  {userFeed.slice(0, 3).map((entry) => (
                    <span key={entry.id}>
                      <strong className={entry.delta >= 0 ? 'trend--up' : 'trend--down'}>
                        {entry.delta >= 0 ? '+' : ''}
                        {entry.delta}
                      </strong>{' '}
                      {entry.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p>The audience has not changed its mind about you yet.</p>
              )}
              <p className="public-meter__next-opportunity">
                <strong>Next opportunity:</strong>{' '}
                {userActiveDirections.length > 0
                  ? getDirectionDescription(userActiveDirections[0], game.players, game.lohId)
                  : 'A strong competition, a smart save or a memorable social move.'}
              </p>
            </div>
          </details>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="public-meter__section">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">Public Rankings</h2>
            <span className="public-meter__section-caption">
              See how every remaining housemate is landing with the outside world.
            </span>
          </div>
          <div className="ranking-list">
            {rankedProfiles.map((profile, index) => {
              const player = game.players.find((p) => p.id === profile.playerId)
              const isUser = player?.isUser ?? false
              const inactive = isInactivePlayer(player)
              const trend = getTrend(profile.approval, profile.previousApproval)
              return (
                <div
                  key={profile.playerId}
                  className={`ranking-row${isUser ? ' ranking-row--self' : ''}${inactive ? ' ranking-row--inactive' : ''}`}
                >
                  <span className="ranking-row__rank">#{index + 1}</span>
                  <PublicMeterAvatar player={player} inactive={inactive} size="sm" />
                  <div className="ranking-row__identity">
                    <span className="ranking-row__name">{player?.name ?? profile.playerId}</span>
                    {inactive && (
                      <span className="ranking-row__state">
                        {player?.status === 'jury' ? 'jury' : 'out'}
                      </span>
                    )}
                  </div>
                  <span className="ranking-row__approval">{profile.approval}%</span>
                  <span className={`ranking-row__trend ${trend.className}`}>{trend.symbol}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="public-meter__section">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">Public Feed</h2>
            <span className="public-meter__section-caption">
              Your visible choices shape the audience reaction.
            </span>
          </div>
          {feed.length === 0 ? (
            <p className="public-meter__empty-note">No public activity yet this season.</p>
          ) : (
            <div className="feed-list">
              {feed.slice(0, 20).map((entry) => {
                const player = game.players.find((p) => p.id === entry.playerId)
                const signal = getFeedSignal(entry.delta)
                return (
                  <div key={entry.id} className="feed-entry">
                    <PublicMeterAvatar
                      player={player}
                      inactive={isInactivePlayer(player)}
                      size="sm"
                    />
                    <div className="feed-entry__body">
                      <span className="feed-entry__text">{entry.text}</span>
                      <span className="feed-entry__meta">Day {entry.week}</span>
                    </div>
                    <span
                      className={signal.className}
                      aria-label={signal.label}
                      title={signal.label}
                    >
                      {signal.symbol}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="public-meter__section">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">Public Requests</h2>
            <span className="public-meter__section-caption">
              Only players still in the house receive public requests.
            </span>
          </div>
          {directionGroups.every((group) => group.items.length === 0) ? (
            <p className="public-meter__empty-note">No public requests yet.</p>
          ) : (
            <div className="direction-groups">
              {directionGroups.map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.key} className="direction-group">
                    <h3 className="direction-group__title">{group.label}</h3>
                    <div className="direction-list">
                      {group.items.map((direction) => {
                        const player = game.players.find((p) => p.id === direction.playerId)
                        const directionSignal = getDirectionSignal(direction)
                        return (
                          <div
                            key={direction.id}
                            className={`direction-card direction-card--${direction.status}`}
                          >
                            <div className="direction-card__header">
                              <div className="direction-card__player-wrap">
                                <PublicMeterAvatar player={player} size="sm" />
                                <span className="direction-card__player">
                                  {player?.name ?? direction.playerId}
                                </span>
                              </div>
                              <span className="direction-card__status">
                                {formatStatus(direction.status)}
                              </span>
                            </div>
                            <p className="direction-card__description">
                              {getDirectionDescription(direction, game.players, game.lohId)}
                            </p>
                            <div className="direction-card__meta">
                              <span>{getDirectionWindowLabel(direction)}</span>
                              <span className={directionSignal.className}>
                                {directionSignal.text}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
