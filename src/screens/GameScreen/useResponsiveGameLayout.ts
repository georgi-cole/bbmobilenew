import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { CompactRosterLayout } from '../../store/settingsSlice'

export type GameLayoutSize =
  | 'phone-small'
  | 'phone-medium'
  | 'phone-large'
  | 'tablet-portrait'
  | 'tablet-landscape'

export type ResponsiveRosterMode = 'normal' | 'compact-small' | 'scroll'
export type RosterHeaderMode = 'transient' | 'persistent'
export type SurvivorStandoutLayoutMode = 'full-card' | 'compact-strip' | 'mini-chip'

export interface ResponsiveGameLayoutBudget {
  layoutSize: GameLayoutSize
  baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'>
  rosterMode: ResponsiveRosterMode
  rosterHeaderMode: RosterHeaderMode
  compactRoster: boolean
  compactRosterLayout: CompactRosterLayout
  avatarTileSize: number
  rosterGap: number
  tvLogRows: number
  survivorStandoutMode: SurvivorStandoutLayoutMode
  cssVars: CSSProperties
  debugEnabled: boolean
  debugLabel: string
  shellMaxWidth: number
  revision: number
  signature: string
}

export interface ResponsiveGameLayoutInput {
  viewportWidth: number
  viewportHeight: number
  stageWidth: number
  stageHeight: number
  safeTop: number
  safeBottom: number
  navHeight: number
  dockHeight: number
  hasDock: boolean
  playerCount: number
  userCompactRoster: boolean
  userCompactRosterLayout: CompactRosterLayout
  isAndroidLike?: boolean
  debugEnabled?: boolean
  revision?: number
}

const ANDROID_TOP_SAFE_FALLBACK = 24
const DEFAULT_NAV_HEIGHT = 60
const DEFAULT_PHONE_WIDTH = 390
const DEFAULT_PHONE_HEIGHT = 780
const DEFAULT_DOCK_RATIO = 220 / 980
const ROSTER_COLUMNS = 4
const ROSTER_GAP = 5
const ROSTER_INLINE_PADDING = 16
const ROSTER_HEADER_HEIGHT = 30
const GAME_VERTICAL_PADDING = 10
const GAME_SECTION_GAPS = 12
const TV_LOG_ROW_HEIGHT = 32
const MAX_PHONE_TV_LOG_ROWS = 5
const MAX_TABLET_TV_LOG_ROWS = 5
const SHORT_ROSTER_MAX_PLAYERS = ROSTER_COLUMNS * 2
const SURVIVOR_STANDOUT_GAP_ALLOWANCE = 10
const SURVIVOR_FULL_STANDOUT_MIN_SPACE = 72
const SURVIVOR_COMPACT_STANDOUT_MIN_SPACE = 34
const SURVIVOR_FULL_STANDOUT_HEIGHT = 74
const SURVIVOR_COMPACT_STANDOUT_HEIGHT = 48
const SURVIVOR_MINI_STANDOUT_HEIGHT = 28

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundPx(value: number) {
  return Math.max(0, Math.round(value))
}

function readPx(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function estimateDockHeight(stageWidth: number) {
  const dockWidth = Math.min(stageWidth * 0.8, 340)
  return dockWidth * DEFAULT_DOCK_RATIO
}

function resolveLayoutSize(width: number, height: number): GameLayoutSize {
  if (width >= 720) {
    return width > height ? 'tablet-landscape' : 'tablet-portrait'
  }
  if (height < 700 || width < 360) return 'phone-small'
  if (height < 840) return 'phone-medium'
  return 'phone-large'
}

function resolveSurvivorStandoutMode(options: {
  layoutSize: GameLayoutSize
  rosterMode: ResponsiveRosterMode
  extraAfterBaseRoster: number
}): SurvivorStandoutLayoutMode {
  if (options.rosterMode === 'scroll' || options.layoutSize === 'phone-small') {
    return 'mini-chip'
  }
  if (options.layoutSize === 'tablet-portrait' || options.layoutSize === 'tablet-landscape') {
    return 'full-card'
  }
  if (options.extraAfterBaseRoster >= SURVIVOR_FULL_STANDOUT_MIN_SPACE) {
    return 'full-card'
  }
  if (options.extraAfterBaseRoster >= SURVIVOR_COMPACT_STANDOUT_MIN_SPACE) {
    return 'compact-strip'
  }
  return 'mini-chip'
}

function getSurvivorStandoutHeight(mode: SurvivorStandoutLayoutMode) {
  switch (mode) {
    case 'full-card':
      return SURVIVOR_FULL_STANDOUT_HEIGHT
    case 'compact-strip':
      return SURVIVOR_COMPACT_STANDOUT_HEIGHT
    case 'mini-chip':
    default:
      return SURVIVOR_MINI_STANDOUT_HEIGHT
  }
}

function resolveBaseTvLogRows(extraAfterBaseRoster: number, isTablet: boolean) {
  if (extraAfterBaseRoster >= 96 || isTablet) {
    return isTablet && extraAfterBaseRoster >= 160 ? 4 : 3
  }
  return extraAfterBaseRoster >= 36 ? 2 : 1
}

function resolveAdaptiveTvLogRows(options: {
  availableAfterTv: number
  baseRosterHeight: number
  baseRows: number
  isTablet: boolean
  playerCount: number
  rosterMode: ResponsiveRosterMode
  survivorStandoutMode: SurvivorStandoutLayoutMode
}) {
  if (options.playerCount > SHORT_ROSTER_MAX_PLAYERS || options.rosterMode === 'scroll') {
    return options.baseRows
  }

  const maxRows = options.isTablet ? MAX_TABLET_TV_LOG_ROWS : MAX_PHONE_TV_LOG_ROWS
  const maxExtraRows = Math.max(0, maxRows - options.baseRows)
  if (maxExtraRows === 0) return options.baseRows

  const survivorStandoutHeight = getSurvivorStandoutHeight(options.survivorStandoutMode)
  const reservedHeight =
    options.baseRosterHeight +
    options.baseRows * TV_LOG_ROW_HEIGHT +
    survivorStandoutHeight +
    SURVIVOR_STANDOUT_GAP_ALLOWANCE
  const slackAfterFeature = options.availableAfterTv - reservedHeight
  const extraRows = clamp(Math.floor(slackAfterFeature / TV_LOG_ROW_HEIGHT), 0, maxExtraRows)

  return options.baseRows + extraRows
}

function buildDebugLabel(input: ResponsiveGameLayoutInput, budget: {
  layoutSize: GameLayoutSize
  baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'>
  rosterMode: ResponsiveRosterMode
  tvLogRows: number
  survivorStandoutMode: SurvivorStandoutLayoutMode
  effectiveSafeTop: number
  dockClearance: number
  rosterMaxHeight: number
}) {
  return [
    `${Math.round(input.viewportWidth)}x${Math.round(input.viewportHeight)}`,
    `stage ${Math.round(input.stageWidth)}x${Math.round(input.stageHeight)}`,
    `safe ${Math.round(budget.effectiveSafeTop)}/${Math.round(input.safeBottom)}`,
    `nav ${Math.round(input.navHeight)}`,
    `dock ${Math.round(budget.dockClearance)}`,
    `tv rows ${budget.tvLogRows}`,
    `standout ${budget.survivorStandoutMode}`,
    `roster ${budget.baseRosterMode}->${budget.rosterMode} ${Math.round(budget.rosterMaxHeight)}`,
    budget.layoutSize,
  ].join(' | ')
}

export function computeResponsiveGameLayout(input: ResponsiveGameLayoutInput): ResponsiveGameLayoutBudget {
  const viewportWidth = input.viewportWidth || input.stageWidth || DEFAULT_PHONE_WIDTH
  const viewportHeight = input.viewportHeight || input.stageHeight || DEFAULT_PHONE_HEIGHT
  const stageWidth = input.stageWidth || Math.min(viewportWidth, DEFAULT_PHONE_WIDTH)
  const stageHeight = input.stageHeight || viewportHeight
  const layoutSize = resolveLayoutSize(viewportWidth, viewportHeight)
  const effectiveSafeTop = input.isAndroidLike
    ? Math.max(input.safeTop, ANDROID_TOP_SAFE_FALLBACK)
    : input.safeTop
  const navHeight = input.navHeight || DEFAULT_NAV_HEIGHT
  void navHeight
  const measuredDockHeight = input.dockHeight || estimateDockHeight(stageWidth)
  const dockClearance = input.hasDock ? measuredDockHeight + 8 : 0
  const isTablet = layoutSize === 'tablet-portrait' || layoutSize === 'tablet-landscape'
  const shellMaxWidth = isTablet
    ? (layoutSize === 'tablet-landscape' ? 560 : 520)
    : 480

  const tileWidth = (stageWidth - ROSTER_INLINE_PADDING - ROSTER_GAP * (ROSTER_COLUMNS - 1)) / ROSTER_COLUMNS
  const normalTileSize = clamp(tileWidth, 64, isTablet ? 128 : 112)
  const compactTileSize = normalTileSize * 0.72
  const rosterRows = Math.max(1, Math.ceil(Math.max(input.playerCount, 1) / ROSTER_COLUMNS))
  const shouldUseCompactBase =
    !isTablet &&
    input.playerCount >= 16 &&
    (layoutSize === 'phone-small' || stageWidth < 370)
  const baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'> = input.userCompactRoster || shouldUseCompactBase
    ? 'compact-small'
    : 'normal'

  const baseTvHeight = layoutSize === 'phone-small'
    ? 204
    : layoutSize === 'phone-medium'
      ? 232
      : isTablet
        ? 292
        : 258
  const tvHeight = clamp(
    stageHeight * (isTablet ? 0.27 : 0.3),
    baseTvHeight,
    isTablet ? 336 : 312,
  )
  const tvViewportHeight = clamp(tvHeight - 82, 132, isTablet ? 238 : 192)
  const availableAfterTv = Math.max(
    0,
    stageHeight - tvHeight - dockClearance - GAME_VERTICAL_PADDING - GAME_SECTION_GAPS,
  )
  const normalRosterHeight = rosterRows * normalTileSize + (rosterRows - 1) * ROSTER_GAP + ROSTER_HEADER_HEIGHT
  const compactRosterHeight = rosterRows * compactTileSize + (rosterRows - 1) * ROSTER_GAP + ROSTER_HEADER_HEIGHT
  const baseAvatarTileSize = baseRosterMode === 'compact-small' ? compactTileSize : normalTileSize
  const baseRosterHeight = baseRosterMode === 'compact-small' ? compactRosterHeight : normalRosterHeight
  const extraAfterBaseRoster = availableAfterTv - baseRosterHeight

  const baseTvLogRows = resolveBaseTvLogRows(extraAfterBaseRoster, isTablet)
  const preliminaryLogHeight = baseTvLogRows * TV_LOG_ROW_HEIGHT
  const preliminaryAvailableRosterHeight = Math.max(
    180,
    stageHeight - tvHeight - preliminaryLogHeight - dockClearance - GAME_VERTICAL_PADDING - GAME_SECTION_GAPS,
  )
  const preliminaryRosterFits = baseRosterHeight <= preliminaryAvailableRosterHeight
  const preliminaryRosterMode: ResponsiveRosterMode = preliminaryRosterFits ? baseRosterMode : 'scroll'
  const preliminarySurvivorStandoutMode = resolveSurvivorStandoutMode({
    layoutSize,
    rosterMode: preliminaryRosterMode,
    extraAfterBaseRoster,
  })
  const tvLogRows = resolveAdaptiveTvLogRows({
    availableAfterTv,
    baseRosterHeight,
    baseRows: baseTvLogRows,
    isTablet,
    playerCount: input.playerCount,
    rosterMode: preliminaryRosterMode,
    survivorStandoutMode: preliminarySurvivorStandoutMode,
  })
  const logHeight = tvLogRows * TV_LOG_ROW_HEIGHT
  const availableRosterHeight = Math.max(
    180,
    stageHeight - tvHeight - logHeight - dockClearance - GAME_VERTICAL_PADDING - GAME_SECTION_GAPS,
  )

  const baseRosterFits = baseRosterHeight <= availableRosterHeight
  const rosterMode: ResponsiveRosterMode = baseRosterFits ? baseRosterMode : 'scroll'
  const survivorStandoutMode = resolveSurvivorStandoutMode({
    layoutSize,
    rosterMode,
    extraAfterBaseRoster,
  })
  const survivorStandoutHeight = getSurvivorStandoutHeight(survivorStandoutMode)

  const rosterHeaderMode: RosterHeaderMode = baseRosterFits || isTablet || layoutSize === 'phone-large'
    ? 'persistent'
    : 'transient'
  const compactRoster = baseRosterMode === 'compact-small'
  const compactRosterLayout = input.userCompactRoster
    ? input.userCompactRosterLayout
    : 'small'
  const rosterMaxHeight = Math.max(
    180,
    availableRosterHeight - (rosterHeaderMode === 'persistent' ? ROSTER_HEADER_HEIGHT : 0),
  )
  const avatarTileSize = baseAvatarTileSize
  const avatarTileSizePx = Math.max(0, Math.floor(avatarTileSize))

  const cssVars = {
    '--game-safe-top': `${roundPx(effectiveSafeTop)}px`,
    '--game-safe-bottom': `${roundPx(input.safeBottom)}px`,
    '--game-screen-floating-dock-clearance': `${roundPx(dockClearance)}px`,
    '--game-screen-tv-min-height': `${roundPx(tvHeight)}px`,
    '--game-screen-tv-viewport-min-height': `${roundPx(tvViewportHeight)}px`,
    '--game-tv-log-rows': String(tvLogRows),
    '--game-roster-max-height': `${roundPx(rosterMaxHeight)}px`,
    '--game-avatar-tile-size': `${avatarTileSizePx}px`,
    '--game-roster-gap': `${ROSTER_GAP}px`,
    '--game-survivor-standout-min-height': `${survivorStandoutHeight}px`,
    '--game-shell-max-width': `${shellMaxWidth}px`,
  } as CSSProperties

  const debugLabel = buildDebugLabel(input, {
    layoutSize,
    baseRosterMode,
    rosterMode,
    tvLogRows,
    survivorStandoutMode,
    effectiveSafeTop,
    dockClearance,
    rosterMaxHeight,
  })
  const signature = [
    layoutSize,
    baseRosterMode,
    rosterMode,
    rosterHeaderMode,
    tvLogRows,
    survivorStandoutMode,
    roundPx(tvHeight),
    roundPx(rosterMaxHeight),
    avatarTileSizePx,
    roundPx(dockClearance),
    roundPx(effectiveSafeTop),
    shellMaxWidth,
  ].join(':')

  return {
    layoutSize,
    baseRosterMode,
    rosterMode,
    rosterHeaderMode,
    compactRoster,
    compactRosterLayout,
    avatarTileSize: avatarTileSizePx,
    rosterGap: ROSTER_GAP,
    tvLogRows,
    survivorStandoutMode,
    cssVars,
    debugEnabled: input.debugEnabled === true,
    debugLabel,
    shellMaxWidth,
    revision: input.revision ?? 0,
    signature,
  }
}

function isLayoutDebugEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('debugLayout')) return true
  try {
    return window.localStorage.getItem('bbmobile:debugLayout') === '1'
  } catch {
    return false
  }
}

function readViewportInput<TStage extends HTMLElement>(
  stageRef: RefObject<TStage | null>,
  options: {
    hasDock: boolean
    playerCount: number
    userCompactRoster: boolean
    userCompactRosterLayout: CompactRosterLayout
  },
  revision: number,
): ResponsiveGameLayoutInput {
  const visualViewport = window.visualViewport
  const viewportWidth = visualViewport?.width ?? window.innerWidth
  const viewportHeight = visualViewport?.height ?? window.innerHeight
  const stageRect = stageRef.current?.getBoundingClientRect()
  const navRect = document.querySelector<HTMLElement>('.nav-bar')?.getBoundingClientRect()
  const dockRect = document.querySelector<HTMLElement>('.game-control-dock')?.getBoundingClientRect()
  const rootStyle = getComputedStyle(document.documentElement)
  const safeTop = Math.max(
    readPx(rootStyle.getPropertyValue('--safe-top')),
    readPx(rootStyle.getPropertyValue('--app-safe-area-top')),
  )
  const safeBottom = Math.max(
    readPx(rootStyle.getPropertyValue('--safe-bottom')),
    readPx(rootStyle.getPropertyValue('--safe-area-inset-bottom')),
  )
  const isAndroidLike = document.documentElement.classList.contains('is-chrome-android')

  return {
    viewportWidth,
    viewportHeight,
    stageWidth: stageRect?.width ?? Math.min(viewportWidth, DEFAULT_PHONE_WIDTH),
    stageHeight: stageRect?.height ?? viewportHeight,
    safeTop,
    safeBottom,
    navHeight: navRect?.height ?? DEFAULT_NAV_HEIGHT,
    dockHeight: dockRect?.height ?? 0,
    hasDock: options.hasDock,
    playerCount: options.playerCount,
    userCompactRoster: options.userCompactRoster,
    userCompactRosterLayout: options.userCompactRosterLayout,
    isAndroidLike,
    debugEnabled: isLayoutDebugEnabled(),
    revision,
  }
}

export function useResponsiveGameLayout<TStage extends HTMLElement>(
  stageRef: RefObject<TStage | null>,
  options: {
    hasDock: boolean
    playerCount: number
    userCompactRoster: boolean
    userCompactRosterLayout: CompactRosterLayout
  },
) {
  const revisionRef = useRef(0)
  const {
    hasDock,
    playerCount,
    userCompactRoster,
    userCompactRosterLayout,
  } = options
  const [budget, setBudget] = useState<ResponsiveGameLayoutBudget>(() =>
    computeResponsiveGameLayout({
      viewportWidth: DEFAULT_PHONE_WIDTH,
      viewportHeight: DEFAULT_PHONE_HEIGHT,
      stageWidth: DEFAULT_PHONE_WIDTH,
      stageHeight: DEFAULT_PHONE_HEIGHT,
      safeTop: 0,
      safeBottom: 0,
      navHeight: DEFAULT_NAV_HEIGHT,
      dockHeight: 0,
      hasDock,
      playerCount,
      userCompactRoster,
      userCompactRosterLayout,
      revision: 0,
    }))

  const measure = useCallback(() => {
    revisionRef.current += 1
    const next = computeResponsiveGameLayout(readViewportInput(stageRef, {
      hasDock,
      playerCount,
      userCompactRoster,
      userCompactRosterLayout,
    }, revisionRef.current))
    setBudget((prev) => (prev.signature === next.signature && prev.debugLabel === next.debugLabel ? prev : next))
  }, [hasDock, playerCount, stageRef, userCompactRoster, userCompactRosterLayout])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)

    const observed = [
      stageRef.current,
      document.querySelector<HTMLElement>('.nav-bar'),
      document.querySelector<HTMLElement>('.game-control-dock'),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement)
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      observed.forEach((el) => resizeObserver?.observe(el))
    }

    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
      resizeObserver?.disconnect()
    }
  }, [measure, stageRef])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.getPropertyValue('--app-shell-max-width')
    root.style.setProperty('--app-shell-max-width', `${budget.shellMaxWidth}px`)
    return () => {
      if (previous) {
        root.style.setProperty('--app-shell-max-width', previous)
      } else {
        root.style.removeProperty('--app-shell-max-width')
      }
    }
  }, [budget.shellMaxWidth])

  return budget
}
