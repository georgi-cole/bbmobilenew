import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

export type GameLayoutSize =
  | 'phone-small'
  | 'phone-medium'
  | 'phone-large'
  | 'tablet-portrait'
  | 'tablet-landscape'

export type ResponsiveRosterMode = 'normal' | 'compact-small' | 'scroll'
export type RosterHeaderMode = 'tv-chip' | 'persistent'
export type SurvivorStandoutLayoutMode = 'full-card' | 'compact-strip' | 'mini-chip'
export type BottomControlsMode = 'normal' | 'compact'

type GameCssVars = CSSProperties & Record<string, string>

export interface ResponsiveGameLayoutBudget {
  layoutSize: GameLayoutSize
  baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'>
  rosterMode: ResponsiveRosterMode
  rosterHeaderMode: RosterHeaderMode
  bottomControlsMode: BottomControlsMode
  compactRoster: boolean
  avatarTileSize: number
  rosterGap: number
  tvLogRows: number
  survivorStandoutMode: SurvivorStandoutLayoutMode
  cssVars: GameCssVars
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
  isAndroidLike?: boolean
  debugEnabled?: boolean
  revision?: number
}

const ANDROID_TOP_SAFE_FALLBACK = 30
const DEFAULT_NAV_HEIGHT = 60
const COMPACT_NAV_HEIGHT = 46
const DEFAULT_PHONE_WIDTH = 390
const DEFAULT_PHONE_HEIGHT = 780
const DEFAULT_DOCK_RATIO = 220 / 980
const COMPACT_DOCK_SCALE = 0.9
const NORMAL_DOCK_GAP = 12
const COMPACT_DOCK_GAP = 8
const ROSTER_COLUMNS = 4
const ROSTER_GAP = 5
const GAME_INLINE_PADDING = 24
const ROSTER_INLINE_PADDING = 16
const ROSTER_HEADER_HEIGHT = 30
const GAME_VERTICAL_PADDING = 10
const GAME_SECTION_GAPS = 12
const TV_LOG_ROW_HEIGHT = 32
const TV_CHROME_HEIGHT = 88
const MAX_PHONE_TV_LOG_ROWS = 5
const MAX_TABLET_TV_LOG_ROWS = 6
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
  extraAfterFeature: number
  isTablet: boolean
  playerCount: number
}) {
  const maxRows = options.playerCount <= SHORT_ROSTER_MAX_PLAYERS
    ? (options.isTablet ? MAX_TABLET_TV_LOG_ROWS : MAX_PHONE_TV_LOG_ROWS)
    : (options.isTablet ? 5 : 3)
  const baseRows = resolveBaseTvLogRows(options.extraAfterFeature, options.isTablet)
  const rowsThatFit = 1 + Math.floor(options.extraAfterFeature / TV_LOG_ROW_HEIGHT)

  return clamp(Math.max(baseRows, rowsThatFit), 1, maxRows)
}

function buildDebugLabel(input: ResponsiveGameLayoutInput, budget: {
  layoutSize: GameLayoutSize
  baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'>
  rosterMode: ResponsiveRosterMode
  rosterHeaderMode: RosterHeaderMode
  bottomControlsMode: BottomControlsMode
  tvLogRows: number
  survivorStandoutMode: SurvivorStandoutLayoutMode
  effectiveSafeTop: number
  dockClearance: number
  navHeight: number
  rosterMaxHeight: number
}) {
  return [
    `${Math.round(input.viewportWidth)}x${Math.round(input.viewportHeight)}`,
    `stage ${Math.round(input.stageWidth)}x${Math.round(input.stageHeight)}`,
    `safe ${Math.round(budget.effectiveSafeTop)}/${Math.round(input.safeBottom)}`,
    `nav ${Math.round(budget.navHeight)}`,
    `dock ${Math.round(budget.dockClearance)}`,
    `controls ${budget.bottomControlsMode}`,
    `tv rows ${budget.tvLogRows}`,
    `standout ${budget.survivorStandoutMode}`,
    `roster ${budget.baseRosterMode}->${budget.rosterMode}/${budget.rosterHeaderMode} ${Math.round(budget.rosterMaxHeight)}`,
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
  const measuredNavHeight = input.navHeight || DEFAULT_NAV_HEIGHT + input.safeBottom
  const normalNavContentHeight = Math.max(DEFAULT_NAV_HEIGHT, measuredNavHeight - input.safeBottom)
  const compactNavContentHeight = Math.min(normalNavContentHeight, COMPACT_NAV_HEIGHT)
  const normalNavHeight = normalNavContentHeight + input.safeBottom
  const compactNavHeight = compactNavContentHeight + input.safeBottom
  const estimatedDockHeight = estimateDockHeight(stageWidth)
  const measuredDockHeight = input.dockHeight || estimatedDockHeight
  const baselineDockHeight = Math.max(measuredDockHeight, estimatedDockHeight)
  const normalDockHeight = input.hasDock ? baselineDockHeight : 0
  const compactDockHeight = input.hasDock ? Math.max(56, baselineDockHeight * COMPACT_DOCK_SCALE) : 0
  // Reserve the same whitespace above and below the floating dock. The CSS
  // positions the dock by actionDockGap from the nav edge; the second gap here
  // keeps the fourth roster row equally far from the dock's upper edge.
  const normalDockClearance = input.hasDock ? normalDockHeight + NORMAL_DOCK_GAP * 2 : 0
  const compactDockClearance = input.hasDock ? compactDockHeight + COMPACT_DOCK_GAP * 2 : 0
  const measuredStageAndNavHeight = stageHeight + measuredNavHeight
  const normalStageHeight = Math.max(0, measuredStageAndNavHeight - normalNavHeight)
  const compactStageHeight = Math.max(0, measuredStageAndNavHeight - compactNavHeight)
  const isTablet = layoutSize === 'tablet-portrait' || layoutSize === 'tablet-landscape'
  const shellMaxWidth = layoutSize === 'tablet-landscape'
    ? roundPx(clamp(viewportWidth - 48, 900, 1100))
    : layoutSize === 'tablet-portrait'
      ? 620
      : 480
  const cabinetMaxHeight = Math.max(0, viewportHeight - effectiveSafeTop - input.safeBottom)
  const panelGap = layoutSize === 'tablet-landscape'
    ? roundPx(clamp(viewportWidth * 0.018, 12, 20))
    : 0
  const layoutColumns = layoutSize === 'tablet-landscape'
    ? 'minmax(0, 1.05fr) minmax(360px, 0.95fr)'
    : '1fr'
  const rosterStageWidth = layoutSize === 'tablet-landscape'
    ? clamp(stageWidth * 0.44, 400, 520)
    : stageWidth

  const rosterContentWidth = Math.max(
    240,
    rosterStageWidth - GAME_INLINE_PADDING - ROSTER_INLINE_PADDING,
  )
  const tileWidth = (rosterContentWidth - ROSTER_GAP * (ROSTER_COLUMNS - 1)) / ROSTER_COLUMNS
  const normalTileMax = layoutSize === 'tablet-landscape'
    ? 112
    : isTablet
      ? 128
      : layoutSize === 'phone-large' && (viewportHeight >= 900 || stageWidth >= 420)
        ? 104
        : layoutSize === 'phone-large'
          ? 80
          : 78
  const normalTileSize = Math.floor(clamp(tileWidth, 76, normalTileMax))
  const compactTileSize = Math.floor(clamp(normalTileSize * 0.86, 64, normalTileSize))
  const rosterRows = Math.max(1, Math.ceil(Math.max(input.playerCount, 1) / ROSTER_COLUMNS))
  const shouldUseCompactBase =
    !isTablet &&
    input.playerCount >= 16 &&
    (layoutSize === 'phone-small' || rosterContentWidth < 320)

  const normalAvailableAfterTv = Math.max(
    0,
    normalStageHeight - normalDockClearance - GAME_VERTICAL_PADDING - GAME_SECTION_GAPS,
  )
  const compactAvailableAfterTv = Math.max(
    0,
    compactStageHeight - compactDockClearance - GAME_VERTICAL_PADDING - GAME_SECTION_GAPS,
  )
  const normalRosterHeight = rosterRows * normalTileSize + (rosterRows - 1) * ROSTER_GAP + ROSTER_HEADER_HEIGHT
  const compactRosterHeight = rosterRows * compactTileSize + (rosterRows - 1) * ROSTER_GAP + ROSTER_HEADER_HEIGHT
  const minTvViewportHeight = layoutSize === 'phone-small'
    ? 112
    : layoutSize === 'phone-medium'
      ? 132
      : isTablet
        ? 176
        : 144
  const minTvHeight = minTvViewportHeight + TV_CHROME_HEIGHT + TV_LOG_ROW_HEIGHT
  const normalWithoutHeader = normalRosterHeight - ROSTER_HEADER_HEIGHT
  const compactWithoutHeader = compactRosterHeight - ROSTER_HEADER_HEIGHT
  const normalControlsFullRosterFits =
    !shouldUseCompactBase &&
    normalRosterHeight + minTvHeight <= normalAvailableAfterTv
  const bottomControlsMode: BottomControlsMode = isTablet
    ? 'normal'
    : normalControlsFullRosterFits
      ? 'normal'
      : 'compact'
  const availableAfterTv = bottomControlsMode === 'normal'
    ? normalAvailableAfterTv
    : compactAvailableAfterTv
  const selectedNavHeight = bottomControlsMode === 'normal' ? normalNavHeight : compactNavHeight
  const selectedNavContentHeight = bottomControlsMode === 'normal' ? normalNavContentHeight : compactNavContentHeight
  const selectedDockHeight = bottomControlsMode === 'normal' ? normalDockHeight : compactDockHeight
  const dockClearance = bottomControlsMode === 'normal' ? normalDockClearance : compactDockClearance
  const normalStaticFitsAfterCompactControls =
    !shouldUseCompactBase &&
    normalWithoutHeader + minTvHeight <= compactAvailableAfterTv
  const baseRosterMode: Exclude<ResponsiveRosterMode, 'scroll'> = isTablet
    ? 'normal'
    : input.userCompactRoster || !normalStaticFitsAfterCompactControls
      ? 'compact-small'
      : 'normal'
  const rosterMode: ResponsiveRosterMode = baseRosterMode
  const baseAvatarTileSize = baseRosterMode === 'compact-small' ? compactTileSize : normalTileSize
  const baseRosterHeight = baseRosterMode === 'compact-small' ? compactRosterHeight : normalRosterHeight
  const baseRosterHeightWithoutHeader = baseRosterMode === 'compact-small' ? compactWithoutHeader : normalWithoutHeader
  const headerFits = baseRosterHeight + minTvHeight <= availableAfterTv
  const rosterHeaderMode: RosterHeaderMode = isTablet
    ? 'persistent'
    : headerFits
      ? 'persistent'
      : 'tv-chip'
  const rosterDisplayHeight = rosterHeaderMode === 'persistent'
    ? baseRosterHeight
    : baseRosterHeightWithoutHeader
  const extraAfterMandatory = Math.max(0, availableAfterTv - rosterDisplayHeight - minTvHeight)
  const survivorStandoutMode = resolveSurvivorStandoutMode({
    layoutSize,
    rosterMode,
    extraAfterBaseRoster: extraAfterMandatory,
  })
  const survivorStandoutHeight = getSurvivorStandoutHeight(survivorStandoutMode)
  const featureReserve = input.playerCount <= SHORT_ROSTER_MAX_PLAYERS
    ? survivorStandoutHeight + SURVIVOR_STANDOUT_GAP_ALLOWANCE
    : 0
  const extraAfterFeature = Math.max(0, extraAfterMandatory - featureReserve)
  const tvLogRows = layoutSize === 'tablet-landscape'
    ? (input.playerCount <= SHORT_ROSTER_MAX_PLAYERS ? MAX_TABLET_TV_LOG_ROWS : 5)
    : resolveAdaptiveTvLogRows({
        extraAfterFeature,
        isTablet,
        playerCount: input.playerCount,
      })
  const extraLogRows = tvLogRows - 1
  const breathingRoom = clamp(extraAfterFeature - extraLogRows * TV_LOG_ROW_HEIGHT, 0, isTablet ? 36 : 20)
  const tvHeight = minTvHeight + extraLogRows * TV_LOG_ROW_HEIGHT + breathingRoom
  const tvViewportHeight = minTvViewportHeight + breathingRoom
  const compactRoster = baseRosterMode === 'compact-small'
  const rosterMaxHeight = baseRosterHeightWithoutHeader
  const avatarTileSize = baseAvatarTileSize
  const avatarTileSizePx = Math.max(0, Math.floor(avatarTileSize))
  const actionDockScale = bottomControlsMode === 'normal' ? 1 : COMPACT_DOCK_SCALE
  const actionDockGap = bottomControlsMode === 'normal' ? NORMAL_DOCK_GAP : COMPACT_DOCK_GAP
  const navItemLabelDisplay = bottomControlsMode === 'normal' ? 'block' : 'none'

  const cssVars = {
    '--game-safe-top': `${roundPx(effectiveSafeTop)}px`,
    '--game-safe-bottom': `${roundPx(input.safeBottom)}px`,
    '--game-bottom-controls-mode': bottomControlsMode,
    '--game-action-dock-scale': String(actionDockScale),
    '--game-action-dock-height': `${roundPx(selectedDockHeight)}px`,
    '--game-action-dock-gap': `${roundPx(actionDockGap)}px`,
    '--game-nav-height': `${roundPx(selectedNavContentHeight)}px`,
    '--game-nav-item-label-display': navItemLabelDisplay,
    '--game-screen-floating-dock-clearance': `${roundPx(dockClearance)}px`,
    '--game-screen-tv-min-height': `${roundPx(tvHeight)}px`,
    '--game-screen-tv-viewport-min-height': `${roundPx(tvViewportHeight)}px`,
    '--game-tv-log-rows': String(tvLogRows),
    '--game-roster-max-height': `${roundPx(rosterMaxHeight)}px`,
    '--game-roster-board-height': `${roundPx(baseRosterHeightWithoutHeader)}px`,
    '--game-avatar-tile-size': `${avatarTileSizePx}px`,
    '--game-roster-gap': `${ROSTER_GAP}px`,
    '--game-survivor-standout-min-height': `${survivorStandoutHeight}px`,
    '--game-shell-max-width': `${shellMaxWidth}px`,
    '--game-cabinet-max-width': `${shellMaxWidth}px`,
    '--game-cabinet-max-height': `${roundPx(cabinetMaxHeight)}px`,
    '--game-layout-columns': layoutColumns,
    '--game-panel-gap': `${panelGap}px`,
  } as GameCssVars

  const debugLabel = buildDebugLabel(input, {
    layoutSize,
    baseRosterMode,
    rosterMode,
    rosterHeaderMode,
    bottomControlsMode,
    tvLogRows,
    survivorStandoutMode,
    effectiveSafeTop,
    dockClearance,
    navHeight: selectedNavHeight,
    rosterMaxHeight,
  })
  const signature = [
    layoutSize,
    baseRosterMode,
    rosterMode,
    rosterHeaderMode,
    bottomControlsMode,
    tvLogRows,
    survivorStandoutMode,
    roundPx(tvHeight),
    roundPx(rosterMaxHeight),
    avatarTileSizePx,
    roundPx(dockClearance),
    roundPx(selectedNavHeight),
    roundPx(effectiveSafeTop),
    shellMaxWidth,
    roundPx(cabinetMaxHeight),
    panelGap,
    layoutColumns,
  ].join(':')

  return {
    layoutSize,
    baseRosterMode,
    rosterMode,
    rosterHeaderMode,
    bottomControlsMode,
    compactRoster,
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
  },
  revision: number,
): ResponsiveGameLayoutInput {
  const visualViewport = window.visualViewport
  const viewportWidth = visualViewport?.width ?? window.innerWidth
  const viewportHeight = Math.max(visualViewport?.height ?? 0, window.innerHeight)
  const stageRect = stageRef.current?.getBoundingClientRect()
  const navRect = document.querySelector<HTMLElement>('.nav-bar')?.getBoundingClientRect()
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
    navHeight: navRect?.height ?? DEFAULT_NAV_HEIGHT + safeBottom,
    dockHeight: options.hasDock ? estimateDockHeight(stageRect?.width ?? Math.min(viewportWidth, DEFAULT_PHONE_WIDTH)) : 0,
    hasDock: options.hasDock,
    playerCount: options.playerCount,
    userCompactRoster: options.userCompactRoster,
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
  },
) {
  const revisionRef = useRef(0)
  const {
    hasDock,
    playerCount,
    userCompactRoster,
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
      revision: 0,
    }))

  const measure = useCallback(() => {
    revisionRef.current += 1
    const next = computeResponsiveGameLayout(readViewportInput(stageRef, {
      hasDock,
      playerCount,
      userCompactRoster,
    }, revisionRef.current))
    setBudget((prev) => (prev.signature === next.signature && prev.debugLabel === next.debugLabel ? prev : next))
  }, [hasDock, playerCount, stageRef, userCompactRoster])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    const observed = [
      stageRef.current,
      document.querySelector<HTMLElement>('.nav-bar'),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement)
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      observed.forEach((el) => resizeObserver?.observe(el))
    }

    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      resizeObserver?.disconnect()
    }
  }, [measure, stageRef])

  useEffect(() => {
    const root = document.documentElement
    const cssVars = budget.cssVars
    const previousShellMaxWidth = root.style.getPropertyValue('--app-shell-max-width')
    const previousNavHeight = root.style.getPropertyValue('--nav-bar-height')
    const previousBottomControlsMode = root.style.getPropertyValue('--game-bottom-controls-mode')
    const previousDockScale = root.style.getPropertyValue('--game-action-dock-scale')
    const previousDockHeight = root.style.getPropertyValue('--game-action-dock-height')
    const previousDockGap = root.style.getPropertyValue('--game-action-dock-gap')
    const previousGameNavHeight = root.style.getPropertyValue('--game-nav-height')
    const previousNavItemLabelDisplay = root.style.getPropertyValue('--game-nav-item-label-display')
    root.style.setProperty('--app-shell-max-width', `${budget.shellMaxWidth}px`)
    root.style.setProperty('--nav-bar-height', cssVars['--game-nav-height'])
    root.style.setProperty('--game-bottom-controls-mode', cssVars['--game-bottom-controls-mode'])
    root.style.setProperty('--game-action-dock-scale', cssVars['--game-action-dock-scale'])
    root.style.setProperty('--game-action-dock-height', cssVars['--game-action-dock-height'])
    root.style.setProperty('--game-action-dock-gap', cssVars['--game-action-dock-gap'])
    root.style.setProperty('--game-nav-height', cssVars['--game-nav-height'])
    root.style.setProperty('--game-nav-item-label-display', cssVars['--game-nav-item-label-display'])
    return () => {
      if (previousShellMaxWidth) {
        root.style.setProperty('--app-shell-max-width', previousShellMaxWidth)
      } else {
        root.style.removeProperty('--app-shell-max-width')
      }
      if (previousNavHeight) {
        root.style.setProperty('--nav-bar-height', previousNavHeight)
      } else {
        root.style.removeProperty('--nav-bar-height')
      }
      if (previousBottomControlsMode) {
        root.style.setProperty('--game-bottom-controls-mode', previousBottomControlsMode)
      } else {
        root.style.removeProperty('--game-bottom-controls-mode')
      }
      if (previousDockScale) {
        root.style.setProperty('--game-action-dock-scale', previousDockScale)
      } else {
        root.style.removeProperty('--game-action-dock-scale')
      }
      if (previousDockHeight) {
        root.style.setProperty('--game-action-dock-height', previousDockHeight)
      } else {
        root.style.removeProperty('--game-action-dock-height')
      }
      if (previousDockGap) {
        root.style.setProperty('--game-action-dock-gap', previousDockGap)
      } else {
        root.style.removeProperty('--game-action-dock-gap')
      }
      if (previousGameNavHeight) {
        root.style.setProperty('--game-nav-height', previousGameNavHeight)
      } else {
        root.style.removeProperty('--game-nav-height')
      }
      if (previousNavItemLabelDisplay) {
        root.style.setProperty('--game-nav-item-label-display', previousNavItemLabelDisplay)
      } else {
        root.style.removeProperty('--game-nav-item-label-display')
      }
    }
  }, [budget.cssVars, budget.shellMaxWidth])

  return budget
}
