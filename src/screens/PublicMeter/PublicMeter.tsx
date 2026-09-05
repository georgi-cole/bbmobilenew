import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAppSelector } from '../../store/hooks'
import {
  selectPublicOpinion,
  selectRankedProfiles,
  selectPublicFeed,
  selectAllDirections,
  publicOpinionConfig,
  audienceMetricDescriptions,
  audienceMetricLabels,
  getAudienceArchetype,
  getAudienceBreakdown,
  type PublicDirection,
  type PublicFeedEntry,
} from '../../publicOpinion'
import type { Player } from '../../types'
import { isEmoji, resolveAvatarCandidates } from '../../utils/avatar'
import './PublicMeter.css'

const DICEBEAR_HOST = 'dicebear.com'
type PublicMeterTab = 'overview' | 'requests'
const audienceMetrics = ['charisma', 'gameplay', 'integrity'] as const

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

const backupGreyLuxFiles = new Set([
  'Ali', 'Aria', 'Ash', 'Bea', 'Blue', 'Dex', 'Echo', 'Finn', 'Ivy', 'Jax', 'Kai',
  'Kian', 'Lia', 'Lux', 'Nico', 'Noa', 'Nova', 'Pax', 'Quinn', 'Rae', 'Remy', 'Rey',
  'Rune', 'Sol', 'Vee', 'Zed', 'mimi',
])

function getBackupGreyLuxAvatar(player: Player): string | null {
  const fileName = player.name === 'Mimi' ? 'mimi' : player.name
  if (!backupGreyLuxFiles.has(fileName)) return null
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
  return `${base}/assets/skins/backup-grey-lux/${fileName}_avatar.webp`
}

function pickMomentVariant(seed: string, variants: string[]): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0
  }
  return variants[Math.abs(hash) % variants.length]
}

function getAudienceMoment(
  entry: PublicFeedEntry,
  playerName: string,
  attributedName?: string,
): string {
  const reason = `${entry.reason ?? ''} ${entry.eventType ?? ''}`.toLowerCase()
  const actor = attributedName && attributedName !== playerName ? attributedName : null
  const variants = (copy: string[]) => pickMomentVariant(`${entry.id}:${reason}`, copy)

  if (/(challenge_quit|quit_early)/.test(reason)) {
    return variants([
      `${playerName} stepped away from the challenge early, and the feeds are asking whether the pressure finally got real.`,
      `The challenge moved on without ${playerName}. Outside, viewers are already debating that early exit.`,
    ])
  }
  if (/(last_place|weak_competition)/.test(reason)) {
    return variants([
      `${playerName} landed at the bottom of the board, and the audience has noticed the shaky finish.`,
      `${playerName}'s competition night went sideways. The group chat is wondering where the fight went.`,
    ])
  }
  if (/(strong_competition|hoh_win|immunity_win|pov_win)/.test(reason)) {
    return variants([
      `${playerName} owned the competition, and viewers are clocking a player who suddenly looks dangerous.`,
      `${playerName} took control when it mattered. Outside, the “main character” comments are arriving fast.`,
    ])
  }
  if (/(vote_promise_broken|conflicting_vote_promises)/.test(reason)) {
    return `${playerName}'s words and vote did not match — and the audience caught every second of it.`
  }
  if (/(vote_promise_kept|showed_loyalty|loyal)/.test(reason)) {
    return `${playerName} stood by their word when the room got tense. Viewers are calling it rare loyalty.`
  }
  if (/(betray|break_alliance)/.test(reason)) {
    return actor
      ? `${playerName} just cut loose from ${actor}, and the fallout is already becoming the house's biggest storyline.`
      : `${playerName} just cut a loyalty loose, and the outside world is bracing for the fallout.`
  }
  if (/(rumor|conflict|confront|poor_social|negative_social)/.test(reason)) {
    return `${playerName} has found themself in the middle of fresh house chatter — and viewers are not looking away.`
  }
  if (/(high_quality_social|social_warmth|positive_social|apolog|repair)/.test(reason)) {
    return actor
      ? `${playerName} and ${actor} were seen getting unusually close, and viewers loved the chemistry.`
      : `${playerName} worked the room with real charm tonight. Outside, a quiet fan club is starting to form.`
  }
  if (/(nomination_backlash|nominated_target|nominated)/.test(reason)) {
    return actor
      ? `${actor}'s move put ${playerName} in the spotlight, and the audience is already picking sides.`
      : `${playerName} is suddenly in the hot seat. The feeds are watching every reaction.`
  }
  if (/(direction_completed)/.test(reason)) {
    return `${playerName} delivered the moment viewers were waiting for — a public request has landed.`
  }
  if (/(direction_failed)/.test(reason)) {
    return `${playerName} let a public moment slip away, and the audience has definitely noticed.`
  }
  return variants([
    `${playerName} just gave the outside world something new to talk about.`,
    `Another ${playerName} moment is sparking fresh debate beyond the house walls.`,
  ])
}

function getAudienceTriggerLabel(reason: string): string {
  const signal = reason.toLowerCase()
  if (/(competition|hoh|pov|immunity|last_place|quit_early)/.test(signal)) return 'Competition'
  if (/(nomination|nominated|vote|evict)/.test(signal)) return 'Nominations'
  if (/(betray|alliance|loyal|promise)/.test(signal)) return 'Alliance'
  if (/(rumor|conflict|confront|drama)/.test(signal)) return 'Conflict'
  if (/(social|warmth|interaction|apolog|repair|closer)/.test(signal)) return 'Social move'
  if (/(direction_completed|direction_failed)/.test(signal)) return 'Public request'
  return 'House moment'
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
  currentLohId?: string | null,
  voxPopuliActive = false
): string {
  if (voxPopuliActive && direction.type === 'influence_hoh') {
    return 'Make your loyalties clear in a way viewers will remember.'
  }
  if (voxPopuliActive && direction.type === 'flip_vote') {
    return 'Create a visible social moment that can shift audience opinion.'
  }
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
    const lighterPortrait = getBackupGreyLuxAvatar(player)
    const resolvedCandidates = resolveAvatarCandidates(player).filter(
      (candidateUrl) => !isDicebearAvatarUrl(candidateUrl)
    )
    return lighterPortrait ? [lighterPortrait, ...resolvedCandidates] : resolvedCandidates
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const rankedProfiles = useAppSelector(selectRankedProfiles)
  const feed = useAppSelector(selectPublicFeed)
  const allDirections = useAppSelector(selectAllDirections)

  const game = useAppSelector((s) => s.game)
  const isVoxPopuli = game.voxPopuli?.status === 'active'
  const userPlayer = game.players.find((p) => p.isUser)
  const userProfile = userPlayer ? publicOpinion.profiles[userPlayer.id] : undefined
  const userFeed = useMemo(
    () => (userPlayer ? feed.filter((entry) => entry.playerId === userPlayer.id).slice(0, 4) : []),
    [feed, userPlayer]
  )
  const publicFeed = useMemo(
    () => feed.filter((entry) => !userPlayer || entry.playerId !== userPlayer.id),
    [feed, userPlayer],
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
  const selectedProfile = selectedPlayerId ? publicOpinion.profiles[selectedPlayerId] : undefined
  const selectedPlayer = selectedPlayerId
    ? game.players.find((player) => player.id === selectedPlayerId)
    : undefined
  const selectedDirections = selectedPlayerId
    ? allDirections.filter(
        (direction) => direction.playerId === selectedPlayerId && direction.status === 'active'
      )
    : []
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
          .sort((left, right) => {
            const leftIsUser = game.players.find((player) => player.id === left.playerId)?.isUser ? 1 : 0
            const rightIsUser = game.players.find((player) => player.id === right.playerId)?.isUser ? 1 : 0
            return rightIsUser - leftIsUser || right.createdWeek - left.createdWeek
          }),
      })),
    [activePlayerIds, allDirections, game.players]
  )
  const requestedTab = searchParams.get('tab')
  const activeTab: PublicMeterTab = requestedTab === 'requests' ? 'requests' : 'overview'

  function handleTabChange(tab: PublicMeterTab) {
    if (tab === 'overview') {
      setSearchParams({}, { replace: true })
      return
    }
    setSearchParams({ tab: 'requests' }, { replace: true })
  }

  if (!hasProfiles) {
    return (
      <div className="public-meter">
        <div className="public-meter__header">
          <h1 className="public-meter__title">📊 Public Meter</h1>
          <button
            className="public-meter__back-btn"
            type="button"
            onClick={() => navigate('/game')}
            aria-label="Go back"
          >
            ↩
          </button>
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
        <div className="public-meter__title-wrap">
          <span className="public-meter__eyebrow">THE OUTSIDE WORLD</span>
          <h1 className="public-meter__title">📊 Public Meter</h1>
          <span className="public-meter__subtitle">The audience is always watching.</span>
        </div>
        <button
          className="public-meter__back-btn"
          type="button"
          onClick={() => navigate('/game')}
          aria-label="Go back"
        >
          ↩
        </button>
      </div>

      {isVoxPopuli && (
        <div className="public-meter__section public-meter__section--vox">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">🗳️ Audience Voting Active</h2>
            <span className="public-meter__section-caption">Vox Populi</span>
          </div>
          <p className="public-meter__vox-copy">
            The public eliminates nominees in this format. Follow your approval trend and Public
            Requests for clues about which visible choices could improve your standing.
          </p>
        </div>
      )}

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
          <div className="public-meter__on-air" aria-label="Audience feed is live">
            <span className="public-meter__on-air-lamp" aria-hidden="true" />
            <span>Audience Live</span>
            <span className="public-meter__on-air-day">Day {game.week}</span>
          </div>
          <div className="public-meter__lens-stage">
            <div
              className="public-meter__lens"
              style={{ '--approval': `${userProfile.approval}%` } as CSSProperties}
              role="progressbar"
              aria-label="Your public approval rating"
              aria-valuenow={userProfile.approval}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="public-meter__lens-glass">
                <PublicMeterAvatar player={userPlayer} size="md" />
                <span className="public-meter__lens-score">{userProfile.approval}%</span>
              </div>
            </div>
            <div className="public-meter__hero-copy">
              <div>
                <h2 className="public-meter__section-title">Your Approval</h2>
                <p className="public-meter__section-caption">
                  How the outside world feels right now.
                </p>
              </div>
              <div className="public-meter__verdict" aria-label="Current audience verdict">
                <span>The crowd is</span>
                <strong>{getApprovalBand(userProfile.approval)}</strong>
              </div>
              <div className="approval-bar__info">
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
                {isInactivePlayer(userPlayer) && (
                  <span className="public-meter__status-pill public-meter__status-pill--inactive">
                    {userPlayer.status === 'jury' ? 'Tribunal phase' : 'Out of game'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="approval-bar">
            <div
              className={`approval-bar__fill ${getApprovalToneClass(userProfile.approval)}`}
              style={{ width: `${userProfile.approval}%` }}
              aria-hidden="true"
            />
          </div>
          <details className="public-meter__explain">
            <summary>What changed</summary>
            <div className="public-meter__explain-body">
              {userFeed.length > 0 ? (
                <div className="public-meter__cause-list">
                  {userFeed.slice(0, 3).map((entry) => (
                    <span key={entry.id}>
                      <strong className={getFeedSignal(entry.delta).className} aria-hidden="true">
                        {getFeedSignal(entry.delta).symbol}
                      </strong>{' '}
                      {getAudienceMoment(entry, userPlayer.name)}
                    </span>
                  ))}
                </div>
              ) : (
                <p>The audience has not changed its mind about you yet.</p>
              )}
              <p className="public-meter__next-opportunity">
                <strong>Next opportunity:</strong>{' '}
                {userActiveDirections.length > 0
                  ? getDirectionDescription(
                      userActiveDirections[0],
                      game.players,
                      game.lohId,
                      isVoxPopuli
                    )
                  : 'A strong competition, a smart save or a memorable social move.'}
              </p>
            </div>
          </details>
          <button
            className="public-meter__dossier-link"
            type="button"
            onClick={() => setSelectedPlayerId(userPlayer.id)}
          >
            Open your audience dossier <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="public-meter__section public-meter__section--rankings">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">Public Rankings</h2>
            <span className="public-meter__section-caption">
              See how every remaining housemate is landing with the outside world.
            </span>
          </div>
          <div className="ranking-list" tabIndex={0} aria-label="Scrollable public rankings">
            {rankedProfiles.map((profile, index) => {
              const player = game.players.find((p) => p.id === profile.playerId)
              const isUser = player?.isUser ?? false
              const inactive = isInactivePlayer(player)
              const trend = getTrend(profile.approval, profile.previousApproval)
              return (
                <button
                  key={profile.playerId}
                  type="button"
                  className={`ranking-row${isUser ? ' ranking-row--self' : ''}${inactive ? ' ranking-row--inactive' : ''}`}
                  onClick={() => setSelectedPlayerId(profile.playerId)}
                  aria-label={`Open ${player?.name ?? profile.playerId}'s audience dossier`}
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
                </button>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="public-meter__section public-meter__section--feed">
          <div className="public-meter__section-heading">
            <h2 className="public-meter__section-title">Public Feed</h2>
            <span className="public-meter__section-caption">
              Your visible choices shape the audience reaction.
            </span>
          </div>
          {publicFeed.length === 0 ? (
            <p className="public-meter__empty-note">No public activity yet this season.</p>
          ) : (
            <div className="feed-list">
              {publicFeed.slice(0, 20).map((entry) => {
                const player = game.players.find((p) => p.id === entry.playerId)
                const attributedPlayer = entry.attributedToId
                  ? game.players.find((candidate) => candidate.id === entry.attributedToId)
                  : undefined
                const signal = getFeedSignal(entry.delta)
                return (
                  <div key={entry.id} className="feed-entry">
                    <PublicMeterAvatar
                      player={player}
                      inactive={isInactivePlayer(player)}
                      size="sm"
                    />
                    <div className="feed-entry__body">
                      <span className="feed-entry__text">
                        {getAudienceMoment(entry, player?.name ?? entry.playerId, attributedPlayer?.name)}
                      </span>
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
        <div className="public-meter__section public-meter__section--requests">
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
                        const isYourDirection = player?.isUser === true
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
                              {getDirectionDescription(
                                direction,
                                game.players,
                                game.lohId,
                                isVoxPopuli
                              )}
                            </p>
                            {direction.status === 'active' && direction.rationale && (
                              <p className="direction-card__rationale">Why now: {direction.rationale}</p>
                            )}
                            {direction.status === 'active' && direction.actionHint && (
                              <p className="direction-card__action-hint">
                                <strong>How:</strong> {direction.actionHint}
                              </p>
                            )}
                            {direction.status === 'active' && isYourDirection && (
                              <div
                                className="direction-card__progress"
                                role="progressbar"
                                aria-label="Public request progress"
                                aria-valuenow={direction.progressPercent ?? 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <span style={{ width: `${direction.progressPercent ?? 0}%` }} />
                                <small>
                                  {direction.completionLabel ?? 'Complete the requested move'} ·{' '}
                                  {direction.progressPercent ?? 0}%
                                </small>
                              </div>
                            )}
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

      {selectedProfile && (
        <div className="audience-dossier__backdrop" role="presentation" onMouseDown={() => setSelectedPlayerId(null)}>
          <section
            className="audience-dossier"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audience-dossier-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="audience-dossier__back"
              type="button"
              onClick={() => setSelectedPlayerId(null)}
              aria-label="Close audience dossier"
            >
              <span aria-hidden="true">↩</span>
            </button>
            <div className="audience-dossier__identity">
              <PublicMeterAvatar
                player={selectedPlayer}
                inactive={isInactivePlayer(selectedPlayer)}
                size="md"
              />
              <div>
                <span className="audience-dossier__eyebrow">Audience dossier</span>
                <h2 id="audience-dossier-title">{selectedPlayer?.name ?? selectedProfile.playerId}</h2>
                <span className="audience-dossier__archetype">{getAudienceArchetype(selectedProfile)}</span>
              </div>
              <strong className="audience-dossier__overall" aria-label="Overall audience rating">
                {selectedProfile.approval}%
                <small>overall</small>
              </strong>
            </div>

            <div className="audience-dossier__metrics" aria-label="Audience rating breakdown">
              {audienceMetrics.map((metric) => {
                const breakdown = getAudienceBreakdown(selectedProfile)
                const value = breakdown[metric]
                return (
                  <div key={metric} className={`audience-metric audience-metric--${metric}`}>
                    <div className="audience-metric__heading">
                      <span>{audienceMetricLabels[metric]}</span>
                      <strong>{value}</strong>
                    </div>
                    <div className="audience-metric__track" aria-hidden="true">
                      <span style={{ width: `${value}%` }} />
                    </div>
                    <p>{audienceMetricDescriptions[metric]}</p>
                  </div>
                )
              })}
            </div>

            {getAudienceBreakdown(selectedProfile).recentChanges[0] && (
              <div className="audience-dossier__trigger">
                <div className="audience-dossier__trigger-heading">
                  <span>{getAudienceTriggerLabel(getAudienceBreakdown(selectedProfile).recentChanges[0].reason)}</span>
                  <strong
                    className={getFeedSignal(getAudienceBreakdown(selectedProfile).recentChanges[0].delta).className}
                    aria-label={getFeedSignal(getAudienceBreakdown(selectedProfile).recentChanges[0].delta).label}
                  >
                    {getFeedSignal(getAudienceBreakdown(selectedProfile).recentChanges[0].delta).symbol}
                  </strong>
                </div>
              </div>
            )}

            {selectedDirections.length > 0 && (
              <div className="audience-dossier__request">
                <span>Audience ask in play</span>
                <strong>{getDirectionDescription(selectedDirections[0], game.players, game.lohId, isVoxPopuli)}</strong>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
