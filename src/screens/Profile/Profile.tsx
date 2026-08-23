import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAppSelector } from '../../store/hooks'
import { selectCurrentProfile, selectIsGuest } from '../../store/profilesSlice'
import { findArchiveUserSummary } from '../../store/achievementSummary'
import { loadSavedRunProfile } from '../../store/saveStatePersistence'
import { imageIdToDataUrl } from '../../utils/imageDb'
import { publicOpinionConfig } from '../../publicOpinion/publicOpinionConfig'
import { normalizeAffinity } from '../../social/affinityUtils'
import { buildUnlockedSurvivorAchievementDisplayModels } from '../../modes/survivorAchievements'
import type { Phase, Player, StatusPillVariant } from '../../types'
import './Profile.css'

const HOLD_REVEAL_DELAY_MS = 360

const PHASE_SHORT_LABELS: Partial<Record<Phase, string>> = {
  // i18n-ignore: Legacy compact phase-label registry stores canonical English copy
  season_start: 'Season',
  week_start: 'Start',
  loh_comp_announcement: 'LOH',
  loh_comp: 'LOH',
  loh_results: 'LOH',
  social_1: 'Social',
  nominations: 'Noms',
  nomination_results: 'Noms',
  pre_veto_public_save: 'Public',
  pos_comp_announcement: 'POS',
  pos_comp: 'POS',
  pos_results: 'POS',
  pos_ceremony: 'Safety',
  pos_ceremony_results: 'Safety',
  social_2: 'Social',
  live_vote: 'Vote',
  eviction_results: 'Evict',
  week_end: 'End',
  final4_eviction: 'F4',
  final3: 'Finale',
  final3_comp1: 'F3 P1',
  final3_comp1_minigame: 'F3 P1',
  final3_comp2: 'F3 P2',
  final3_comp2_minigame: 'F3 P2',
  final3_comp3: 'F3 P3',
  final3_comp3_minigame: 'F3 P3',
  final3_decision: 'Final LOH',
  jury_announcement: 'Tribunal',
  jury_cinematic: 'Tribunal',
  jury: 'Tribunal',
}

type TitleCounter = {
  title: string
  count: number
}

type CareerStats = {
  seasons: number
  wins: number
  lohWins: number
  posWins: number
  compsWon: number
  lastPlaces: number
  nominations: number
  fanFaves: number
  avgRating: number | null
  titlesWon: TitleCounter[]
}

type StatusChipData = {
  id: string
  icon: string
  variant: StatusPillVariant
  shortValue: string
  detailLabel: string
  detailValue: string
  detailHint?: string
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeStoredTitle(title: string): string {
  return title.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toUpperCase()
}

function formatTitleLabel(title: string): string {
  return normalizeStoredTitle(title)
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function getSummaryCompWins(summary: {
  lohWins?: number
  posWins?: number
  battleBackWins?: number
  compsWon?: number
}): number {
  const explicitComps = toNumber(summary.compsWon)
  const derivedComps =
    toNumber(summary.lohWins) + toNumber(summary.posWins) + toNumber(summary.battleBackWins)
  return Math.max(explicitComps, derivedComps)
}

function selectHighestSummary<T extends { playerId: string }>(
  summaries: T[],
  score: (summary: T) => number,
  options: { preferDifferentFromId?: string; allowZero?: boolean } = {}
): T | null {
  const ranked = [...summaries].sort((a, b) => score(b) - score(a))
  if (ranked.length === 0) return null
  const allowZero = options.allowZero ?? true
  const preferred = ranked.find(
    (summary) =>
      summary.playerId !== options.preferDifferentFromId && (allowZero || score(summary) > 0)
  )
  return preferred ?? ranked.find((summary) => allowZero || score(summary) > 0) ?? ranked[0]
}

function selectLowestSummary<T extends { playerId: string }>(
  summaries: T[],
  score: (summary: T) => number
): T | null {
  if (summaries.length === 0) return null
  return [...summaries].sort((a, b) => score(a) - score(b))[0] ?? null
}

function addArchiveTitle(
  titlesByPlayerId: Map<string, string[]>,
  playerId: string | undefined,
  title: string
): void {
  if (!playerId) return
  const normalizedTitle = normalizeStoredTitle(title)
  const existing = titlesByPlayerId.get(playerId) ?? []
  if (!existing.includes(normalizedTitle)) existing.push(normalizedTitle)
  titlesByPlayerId.set(playerId, existing)
}

function deriveArchiveTitleMap(archive: {
  playerSummaries?: Array<{
    playerId: string
    lohWins?: number
    posWins?: number
    battleBackWins?: number
    compsWon?: number
    timesNominated?: number
    noms?: number
    finalPublicApproval?: number
  }>
}): Map<string, string[]> {
  const summaries = Array.isArray(archive.playerSummaries) ? archive.playerSummaries : []
  const titlesByPlayerId = new Map<string, string[]>()
  if (summaries.length === 0) return titlesByPlayerId

  const nominations = (summary: { timesNominated?: number; noms?: number }) =>
    Math.max(toNumber(summary.timesNominated), toNumber(summary.noms))

  const compzilla = selectHighestSummary(summaries, getSummaryCompWins, { allowZero: true })
  const headHoncho = selectHighestSummary(summaries, (summary) => toNumber(summary.lohWins), {
    preferDifferentFromId: compzilla?.playerId,
    allowZero: true,
  })
  const messFactory = selectHighestSummary(summaries, nominations, { allowZero: true })
  const ghostMode = selectLowestSummary(summaries, nominations)

  addArchiveTitle(titlesByPlayerId, compzilla?.playerId, 'COMPZILLA')
  addArchiveTitle(titlesByPlayerId, headHoncho?.playerId, 'HEAD HONCHO')
  addArchiveTitle(titlesByPlayerId, messFactory?.playerId, 'MESS FACTORY')
  addArchiveTitle(titlesByPlayerId, ghostMode?.playerId, 'GHOST MODE')

  const ratedSummaries = summaries.filter(
    (summary) => typeof summary.finalPublicApproval === 'number'
  )
  if (ratedSummaries.length > 0) {
    const vibeCurator = selectHighestSummary(
      ratedSummaries,
      (summary) => toNumber(summary.finalPublicApproval),
      { allowZero: true }
    )
    const heatMagnet = selectLowestSummary(ratedSummaries, (summary) =>
      toNumber(summary.finalPublicApproval)
    )
    addArchiveTitle(titlesByPlayerId, vibeCurator?.playerId, 'VIBE CURATOR')
    addArchiveTitle(titlesByPlayerId, heatMagnet?.playerId, 'HEAT MAGNET')
  }

  return titlesByPlayerId
}

function getArchiveUserTitles(
  archive: {
    playerSummaries?: Array<{ playerId: string; titlesWon?: string[] }>
  },
  userSummary: { playerId: string; titlesWon?: string[] }
): string[] {
  const storedTitles = Array.isArray(userSummary.titlesWon)
    ? userSummary.titlesWon.map(normalizeStoredTitle).filter(Boolean)
    : []
  if (storedTitles.length > 0) return storedTitles
  return deriveArchiveTitleMap(archive).get(userSummary.playerId) ?? []
}

function findApprovalBand(approval: number): string {
  return (
    publicOpinionConfig.approvalBands.find((band) => approval >= band.min && approval <= band.max)
      ?.label ?? 'mixed'
  )
}

function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`
}

function formatIsoDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatPhaseLabel(phase: Phase): string {
  const short = PHASE_SHORT_LABELS[phase]
  if (short) return short
  return phase
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function describeHouseRating(rating: number): string {
  if (rating >= 80) return 'Trusted'
  if (rating >= 60) return 'Liked'
  if (rating >= 40) return 'Mixed'
  if (rating >= 20) return 'Distrusted'
  return 'Targeted'
}

function buildNominationChip(nomineeIds: string[], userPlayer: Player | null): StatusChipData {
  if (userPlayer?.finalRank === 1) {
    return {
      id: 'winner',
      icon: '🏆',
      variant: 'success',
      shortValue: 'Winner',
      detailLabel: 'Season result',
      detailValue: 'Winner',
    }
  }
  if (userPlayer?.finalRank === 2) {
    return {
      id: 'runner-up',
      icon: '🥈',
      variant: 'info',
      shortValue: 'Runner-up',
      detailLabel: 'Season result',
      detailValue: 'Runner-up',
    }
  }
  if (userPlayer?.status === 'jury') {
    return {
      id: 'jury',
      icon: '⚖️',
      variant: 'info',
      shortValue: 'Tribunal',
      detailLabel: 'House status',
      detailValue: 'Tribunal member',
    }
  }
  if (userPlayer?.status === 'evicted') {
    return {
      id: 'evicted',
      icon: '🚪',
      variant: 'neutral',
      shortValue: 'Out',
      detailLabel: 'House status',
      detailValue: 'Eliminated',
    }
  }
  if (nomineeIds.includes('user')) {
    return {
      id: 'nominated',
      icon: '🎯',
      variant: 'danger',
      shortValue: 'Nominated',
      detailLabel: 'Nomination status',
      detailValue: 'On the block',
    }
  }
  return {
    id: 'safe',
    icon: '🛡️',
    variant: 'success',
    shortValue: 'Safe',
    detailLabel: 'Nomination status',
    detailValue: 'Safe this round',
  }
}

function useCareerStats(userIdentity: Pick<Player, 'id' | 'name'> | null): CareerStats {
  return useAppSelector((s) => {
    const archives = s.game.seasonArchives ?? []
    let seasons = 0
    let lohWins = 0
    let posWins = 0
    let wins = 0
    let compsWon = 0
    let lastPlaces = 0
    let nominations = 0
    let fanFaves = 0
    let ratingTotal = 0
    let ratedSeasons = 0
    const titlesByName = new Map<string, number>()

    for (const archive of archives) {
      const me = findArchiveUserSummary(archive, userIdentity)
      if (!me) continue

      seasons += 1
      lohWins += toNumber(me.lohWins)
      posWins += toNumber(me.posWins)
      compsWon += getSummaryCompWins(me)
      nominations += Math.max(toNumber(me.timesNominated), toNumber(me.noms))
      if (me.finalPlacement === 1) wins += 1
      if (me.wonPublicFavorite) fanFaves += 1
      if (typeof me.finalPublicApproval === 'number') {
        ratingTotal += me.finalPublicApproval
        ratedSeasons += 1
      }

      const archivePlacements = archive.playerSummaries
        .map((summary) => toNumber(summary.finalPlacement))
        .filter((placement) => placement > 0)
      const worstPlacement = archivePlacements.length > 0 ? Math.max(...archivePlacements) : 0
      if (worstPlacement > 0 && me.finalPlacement === worstPlacement) {
        lastPlaces += 1
      } else if (worstPlacement === 0) {
        const archiveDaysAlive = archive.playerSummaries
          .map((summary) => toNumber(summary.daysAlive ?? summary.weeksAlive))
          .filter((daysAlive) => daysAlive > 0)
        const earliestExit = archiveDaysAlive.length > 0 ? Math.min(...archiveDaysAlive) : 0
        const myDaysAlive = toNumber(me.daysAlive ?? me.weeksAlive)
        if (earliestExit > 0 && myDaysAlive === earliestExit) {
          lastPlaces += 1
        }
      }

      getArchiveUserTitles(archive, me).forEach((title) => {
        titlesByName.set(title, (titlesByName.get(title) ?? 0) + 1)
      })
    }

    return {
      seasons,
      lohWins,
      posWins,
      wins,
      compsWon,
      lastPlaces,
      nominations,
      fanFaves,
      avgRating: ratedSeasons > 0 ? ratingTotal / ratedSeasons : null,
      titlesWon: [...titlesByName.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([title, count]) => ({ title: formatTitleLabel(title), count })),
    }
  })
}

function HoldRevealPill({
  icon,
  variant,
  shortValue,
  detailLabel,
  detailValue,
  detailHint,
}: StatusChipData) {
  const [revealed, setRevealed] = useState(false)
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearRevealTimeout() {
    if (!revealTimeoutRef.current) return
    clearTimeout(revealTimeoutRef.current)
    revealTimeoutRef.current = null
  }

  function startReveal() {
    clearRevealTimeout()
    revealTimeoutRef.current = setTimeout(() => {
      setRevealed(true)
      revealTimeoutRef.current = null
    }, HOLD_REVEAL_DELAY_MS)
  }

  function stopReveal() {
    clearRevealTimeout()
    setRevealed(false)
  }

  useEffect(() => () => clearRevealTimeout(), [])

  const ariaLabel = detailHint
    ? `${detailLabel}: ${detailValue}. ${detailHint}. Press and hold for details.`
    : `${detailLabel}: ${detailValue}. Press and hold for details.`
  const title = detailHint
    ? `${detailLabel}: ${detailValue} • ${detailHint}`
    : `${detailLabel}: ${detailValue}`

  return (
    <button
      type="button"
      className={`status-pill status-pill--${variant} profile-screen__hold-pill${revealed ? ' profile-screen__hold-pill--revealed' : ''}`}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={startReveal}
      onPointerUp={stopReveal}
      onPointerLeave={stopReveal}
      onPointerCancel={stopReveal}
      onBlur={stopReveal}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setRevealed(true)
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') stopReveal()
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="status-pill__icon" aria-hidden="true">
        {icon}
      </span>
      {!revealed ? (
        <span className="status-pill__label">{shortValue}</span>
      ) : (
        <span className="profile-screen__hold-pill-copy">
          <span className="profile-screen__hold-pill-caption">{detailLabel}</span>
          <span className="profile-screen__hold-pill-value">{detailValue}</span>
          {detailHint ? <span className="profile-screen__hold-pill-hint">{detailHint}</span> : null}
        </span>
      )}
    </button>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = useAppSelector(selectCurrentProfile)
  const isGuest = useAppSelector(selectIsGuest)

  const season = useAppSelector((s) => s.game.season)
  const week = useAppSelector((s) => s.game.week)
  const phase = useAppSelector((s) => s.game.phase)
  const isGameActive = useAppSelector((s) => s.game.status === 'active')
  const lohId = useAppSelector((s) => s.game.lohId)
  const nomineeIds = useAppSelector((s) => s.game.nomineeIds)
  const posWinnerId = useAppSelector((s) => s.game.posWinnerId)
  const userPlayer = useAppSelector((s) => s.game.players.find((p) => p.isUser) ?? null)
  const publicApproval = useAppSelector((s) => {
    const userId = s.game.players.find((player) => player.isUser)?.id ?? 'user'
    return s.publicOpinion?.profiles?.[userId]?.approval ?? publicOpinionConfig.DEFAULT_APPROVAL
  })
  const houseRating = useAppSelector((s) => {
    const userId = s.game.players.find((player) => player.isUser)?.id ?? 'user'
    const housePlayers = s.game.players.filter(
      (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
    )
    const ratings = housePlayers
      .map((player) => s.social?.relationships?.[player.id]?.[userId]?.affinity)
      .filter((affinity): affinity is number => typeof affinity === 'number')

    if (ratings.length === 0) return null
    const averageAffinity = ratings.reduce((sum, affinity) => sum + affinity, 0) / ratings.length
    return (normalizeAffinity(averageAffinity) + 1) * 50
  })

  const userIdentity = useMemo<Pick<Player, 'id' | 'name'> | null>(() => {
    if (userPlayer) return { id: userPlayer.id, name: userPlayer.name }
    if (profile) return { id: 'user', name: profile.name }
    return null
  }, [profile, userPlayer])
  const careerStats = useCareerStats(userIdentity)
  const savedRunProfile = profile ? loadSavedRunProfile(profile.id) : null
  const survivorUnlocks = savedRunProfile?.stats.survivorAchievementsUnlocked ?? {}
  const survivorHighestDay = savedRunProfile?.stats.maxSurvivorDaysSurvived ?? 0
  const survivorUnlockedCount = Object.keys(survivorUnlocks).length
  const survivorAchievementCards = buildUnlockedSurvivorAchievementDisplayModels(survivorUnlocks)

  const gameInProgress =
    isGameActive || week > 1 || (phase !== 'season_start' && phase !== 'week_start')
  const returnTo = (location.state as { from?: string } | null)?.from === '/' ? '/' : '/game'
  const goBack = () => navigate(returnTo, { replace: true })

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (profile?.photoId) {
        const url = await imageIdToDataUrl(profile.photoId)
        if (!cancelled) setPhotoUrl(url ?? null)
      } else if (!cancelled) {
        setPhotoUrl(null)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [profile?.photoId])

  const statusChips = useMemo<StatusChipData[]>(() => {
    if (!gameInProgress) return []

    const chips: StatusChipData[] = [
      {
        id: 'season',
        icon: '🎬',
        variant: 'info',
        shortValue: `S${season}`,
        detailLabel: 'Season',
        detailValue: `Season ${season}`,
      },
      {
        id: 'day',
        icon: '🗓️',
        variant: 'week',
        shortValue: String(week),
        detailLabel: 'Day',
        detailValue: `Day ${week}`,
      },
      {
        id: 'phase',
        icon: '📡',
        variant: 'phase',
        shortValue: formatPhaseLabel(phase),
        detailLabel: 'Phase',
        detailValue: formatPhaseLabel(phase),
      },
      buildNominationChip(nomineeIds, userPlayer),
      {
        id: 'public-rating',
        icon: '📣',
        variant: 'info',
        shortValue: formatPercent(publicApproval, 0),
        detailLabel: "Viewer's rating",
        detailValue: formatPercent(publicApproval, 1),
        detailHint: findApprovalBand(publicApproval),
      },
    ]

    if (houseRating != null) {
      chips.push({
        id: 'house-rating',
        icon: '🏠',
        variant: 'neutral',
        shortValue: formatPercent(houseRating, 0),
        detailLabel: 'House rating',
        detailValue: formatPercent(houseRating, 1),
        detailHint: describeHouseRating(houseRating),
      })
    }

    if (lohId === 'user') {
      chips.push({
        id: 'loh',
        icon: '👑',
        variant: 'success',
        shortValue: 'LOH',
        detailLabel: 'House power',
        detailValue: 'Leader of the House',
      })
    }

    if (posWinnerId === 'user') {
      chips.push({
        id: 'pos',
        icon: '🔑',
        variant: 'warning',
        shortValue: 'POS',
        detailLabel: 'Safety power',
        detailValue: 'Power of Safety holder',
      })
    }

    return chips
  }, [
    gameInProgress,
    houseRating,
    lohId,
    nomineeIds,
    phase,
    posWinnerId,
    publicApproval,
    season,
    userPlayer,
    week,
  ])

  function renderStatusChips() {
    if (statusChips.length === 0) {
      return (
        <p className="profile-screen__no-game">
          No active game - start playing to see live status.
        </p>
      )
    }
    return statusChips.map((chip) => <HoldRevealPill key={chip.id} {...chip} />)
  }

  if (isGuest) {
    return (
      <div className="placeholder-screen profile-screen">
        <div className="profile-screen__guest-banner">
          <p style={{ margin: '0 0 6px' }}>
            You are playing as <strong>Guest</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            Stats and season archives are not saved in guest mode.
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <button
              type="button"
              className="profile-screen__guest-link"
              onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
            >
              Create a profile to save progress -&gt;
            </button>
          </p>
        </div>
        <div className="profile-screen__status-card">
          <p className="profile-screen__section-title">Game Status</p>
          <div className="profile-screen__chips">{renderStatusChips()}</div>
        </div>
        <button
          type="button"
          className="profile-screen__switch-btn game-button game-button--secondary"
          onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
        >
          Select Profile
        </button>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="placeholder-screen profile-screen">
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginBottom: 20 }}>
          No profile selected.
        </p>
        <button
          type="button"
          className="profile-screen__switch-btn game-button game-button--secondary"
          onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
          style={{ marginBottom: 12 }}
        >
          Select or Create a Profile
        </button>
      </div>
    )
  }

  const bio = profile.bio

  return (
    <div className="placeholder-screen profile-screen">
      <div className="profile-screen__title-row">
        <h1 className="profile-screen__page-title">Profile</h1>
        <button
          type="button"
          className="profile-screen__back-btn"
          onClick={goBack}
          aria-label="Go back"
        >
          ↩
        </button>
      </div>
      <div className="profile-screen__header">
        {photoUrl ? (
          <img className="profile-screen__avatar-img" src={photoUrl} alt={profile.name} />
        ) : (
          <span className="profile-screen__avatar">{profile.avatar}</span>
        )}
        <div className="profile-screen__identity">
          <p className="profile-screen__name">{profile.name}</p>
          {bio?.profession && <p className="profile-screen__sub">{bio.profession}</p>}
          {bio?.location && <p className="profile-screen__sub">📍 {bio.location}</p>}
        </div>
        <div className="profile-screen__header-btns">
          <button
            type="button"
            className="profile-screen__icon-btn game-button game-button--menu game-button--ghost"
            onClick={() => navigate('/profile-edit', { state: { from: returnTo } })}
            aria-label="Edit profile"
          >
            Edit
          </button>
          <button
            type="button"
            className="profile-screen__icon-btn game-button game-button--menu game-button--ghost"
            onClick={() => navigate('/profile-picker', { state: { from: returnTo } })}
            aria-label="Switch profile"
          >
            Switch
          </button>
        </div>
      </div>

      <div className="profile-screen__status-card">
        <p className="profile-screen__section-title">Current Status</p>
        <div className="profile-screen__chips">{renderStatusChips()}</div>
      </div>

      {bio &&
        (bio.story ||
          bio.location ||
          bio.profession ||
          bio.age ||
          bio.zodiac ||
          bio.funFact ||
          bio.motto) && (
          <div className="profile-screen__bio-card">
            <p className="profile-screen__section-title">About</p>
            {bio.story && <p className="profile-screen__bio-story">{bio.story}</p>}
            <div className="profile-screen__bio-grid">
              {bio.profession && (
                <div className="profile-screen__bio-item">
                  <span className="profile-screen__bio-key">Profession</span>
                  <span className="profile-screen__bio-val">{bio.profession}</span>
                </div>
              )}
              {bio.location && (
                <div className="profile-screen__bio-item">
                  <span className="profile-screen__bio-key">Hometown</span>
                  <span className="profile-screen__bio-val">{bio.location}</span>
                </div>
              )}
              {bio.age && (
                <div className="profile-screen__bio-item">
                  <span className="profile-screen__bio-key">Age</span>
                  <span className="profile-screen__bio-val">{bio.age}</span>
                </div>
              )}
              {bio.zodiac && (
                <div className="profile-screen__bio-item">
                  <span className="profile-screen__bio-key">Zodiac</span>
                  <span className="profile-screen__bio-val">{bio.zodiac}</span>
                </div>
              )}
              {bio.funFact && (
                <div className="profile-screen__bio-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="profile-screen__bio-key">Fun Fact</span>
                  <span className="profile-screen__bio-val">{bio.funFact}</span>
                </div>
              )}
              {bio.motto && (
                <div className="profile-screen__bio-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="profile-screen__bio-key">Motto</span>
                  <span className="profile-screen__bio-val">"{bio.motto}"</span>
                </div>
              )}
            </div>
          </div>
        )}

      {careerStats.seasons > 0 && (
        <div className="profile-screen__stats-card">
          <p className="profile-screen__section-title">Career Stats</p>
          <div className="profile-screen__stats-grid">
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.seasons}</span>
              <span className="profile-screen__stat-key">Seasons</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.wins}</span>
              <span className="profile-screen__stat-key">Wins</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.lohWins}</span>
              <span className="profile-screen__stat-key">LOH Wins</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.posWins}</span>
              <span className="profile-screen__stat-key">POS Wins</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.compsWon}</span>
              <span className="profile-screen__stat-key">Comps Won</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.lastPlaces}</span>
              <span className="profile-screen__stat-key">Last Places</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.nominations}</span>
              <span className="profile-screen__stat-key">Nominations</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">{careerStats.fanFaves}</span>
              <span className="profile-screen__stat-key">Fan Fave</span>
            </div>
            <div className="profile-screen__stat">
              <span className="profile-screen__stat-val">
                {careerStats.avgRating == null ? '-' : formatPercent(careerStats.avgRating, 1)}
              </span>
              <span className="profile-screen__stat-key">Avg Rating</span>
            </div>
          </div>
        </div>
      )}

      <div className="profile-screen__survivor-card">
        <div className="profile-screen__survivor-header">
          <div>
            <p className="profile-screen__section-title">Surveyeval Progress</p>
            <p className="profile-screen__survivor-copy">
              Progress is saved to this profile and carries across Surveyeval runs.
            </p>
          </div>
          <div className="profile-screen__survivor-count">{survivorUnlockedCount} unlocked</div>
        </div>
        <div className="profile-screen__survivor-stats">
          <div className="profile-screen__survivor-stat">
            <span className="profile-screen__survivor-stat-val">
              {survivorHighestDay > 0 ? survivorHighestDay : '-'}
            </span>
            <span className="profile-screen__survivor-stat-key">Highest Day</span>
          </div>
          <div className="profile-screen__survivor-stat">
            <span className="profile-screen__survivor-stat-val">{survivorUnlockedCount}</span>
            <span className="profile-screen__survivor-stat-key">Unlocked</span>
          </div>
        </div>
        <div className="profile-screen__survivor-grid">
          {survivorUnlockedCount === 0 ? (
            <div className="profile-screen__survivor-empty">
              <p className="profile-screen__empty-text">No Surveyeval achievements unlocked yet.</p>
              <p className="profile-screen__survivor-empty-hint">
                Reach Surveyeval Day 10 to unlock your first milestone.
              </p>
            </div>
          ) : (
            survivorAchievementCards.map((achievement) => (
              <article
                key={achievement.id}
                className={[
                  'profile-screen__survivor-achievement',
                  achievement.isUnlocked ? 'profile-screen__survivor-achievement--unlocked' : '',
                  !achievement.isUnlocked && achievement.visibility === 'secret'
                    ? 'profile-screen__survivor-achievement--secret'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="profile-screen__survivor-card-top">
                  <span className="profile-screen__survivor-tier">{achievement.tierLabel}</span>
                  <span className="profile-screen__survivor-category">
                    {achievement.categoryLabel}
                  </span>
                </div>
                <p className="profile-screen__survivor-name">{achievement.title}</p>
                <p className="profile-screen__survivor-subtitle">{achievement.subtitle}</p>
                <p className="profile-screen__survivor-requirement">
                  {achievement.visibility === 'secret'
                    ? `Secret Day ${achievement.day}`
                    : `Day ${achievement.day} milestone`}
                </p>
                {achievement.isUnlocked && achievement.unlock ? (
                  <p className="profile-screen__survivor-unlocked">
                    Unlocked {formatIsoDate(achievement.unlock.unlockedAt)} · Day{' '}
                    {achievement.unlock.unlockedAtDay}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>

      {careerStats.seasons > 0 && (
        <div className="profile-screen__titles-card">
          <p className="profile-screen__section-title">Titles Won</p>
          {careerStats.titlesWon.length > 0 ? (
            <div className="profile-screen__titles-grid">
              {careerStats.titlesWon.map((title) => (
                <div key={title.title} className="profile-screen__title-chip">
                  <span>{title.title}</span>
                  <span className="profile-screen__title-count">x{title.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-screen__empty-text">No titles won yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
