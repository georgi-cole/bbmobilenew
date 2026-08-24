import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import NavBar from './NavBar'
import { useAppSelector } from '../../store/hooks'
import { selectFinale } from '../../store/finaleSlice'
import { selectSettings } from '../../store/settingsSlice'
import { selectRemoteBroadcast, selectRemoteConfig } from '../../remoteConfig/remoteConfigSlice'
import useGameMode from '../../hooks/useGameMode'
import { buildViewportMetaContent } from './viewportMeta'
import PortraitOrientationGuard from './PortraitOrientationGuard'
import SaveRecoveryNotice from '../SaveRecoveryNotice/SaveRecoveryNotice'
import PhonePreviewSystemChrome from './PhonePreviewSystemChrome'
import './AppShell.css'

const THEME_PRESETS = ['midnight', 'neon', 'sunset', 'ocean']
const DebugPanel = lazy(() => import('../DebugPanel/DebugPanel'))
const QaManagerShortcuts = lazy(() => import('../DebugPanel/QaManagerShortcuts'))
const FinalFaceoff = lazy(() => import('../FinalFaceoff/FinalFaceoff'))
const SeasonFinaleOverlay = lazy(() => import('../SeasonFinale/SeasonFinaleOverlay'))
const VoxPopuliFinaleOverlay = lazy(() => import('../VoxPopuliFinale/VoxPopuliFinaleOverlay'))

/**
 * AppShell — persistent wrapper around every screen.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │   <Outlet />  (screen)  │  ← fills remaining height
 *   ├─────────────────────────┤
 *   │   <NavBar />            │  ← always visible bottom bar
 *   └─────────────────────────┘
 *
 * The FinalFaceoff overlay is rendered above all screens (z-index 7000)
 * when the game reaches the jury phase.
 *
 * To add a new screen: register a route in src/routes.tsx.
 * The nav bar automatically picks it up from its own LINKS array.
 */
export default function AppShell() {
  const location = useLocation()
  const phase = useAppSelector((s) => s.game.phase)
  const seasonFinale = useAppSelector((s) => s.game.seasonFinale)
  const voxPopuliActive = useAppSelector((s) => s.game.voxPopuli?.status === 'active')
  const finale = useAppSelector(selectFinale)
  const settings = useAppSelector(selectSettings)
  const { display } = settings
  const remoteConfig = useAppSelector(selectRemoteConfig)
  const remoteBroadcast = useAppSelector(selectRemoteBroadcast)

  // Gameplay owns the full Android display. Other screens restore the native
  // status bar and continue to use the measured safe-area inset.
  useGameMode(location.pathname === '/game')

  // Apply theme preset and accessibility classes to document.body
  useEffect(() => {
    THEME_PRESETS.forEach((t) => document.body.classList.remove(`theme-${t}`))
    document.body.classList.add(`theme-${display.themePreset}`)
  }, [display.themePreset])

  // Keep viewport-fit=cover attached to every runtime viewport meta rewrite.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta) return undefined
    const applyViewportMeta = () => {
      meta.content = buildViewportMetaContent(settings.visual?.enableZoom ?? false)
    }
    applyViewportMeta()
    const id = window.setTimeout(applyViewportMeta, 0)
    return () => window.clearTimeout(id)
  }, [settings.visual?.enableZoom])

  // Apply remote theme CSS custom properties (overrides the preset class values).
  // Properties are cleared when the remote config has no theme section.
  useEffect(() => {
    const theme = remoteConfig?.season?.theme
    if (theme?.accent) {
      document.body.style.setProperty('--color-accent', theme.accent)
    } else {
      document.body.style.removeProperty('--color-accent')
    }
    if (theme?.accent2) {
      document.body.style.setProperty('--color-accent-2', theme.accent2)
    } else {
      document.body.style.removeProperty('--color-accent-2')
    }
    if (theme?.background) {
      document.body.style.setProperty('--color-bg', theme.background)
    } else {
      document.body.style.removeProperty('--color-bg')
    }
    return () => {
      document.body.style.removeProperty('--color-accent')
      document.body.style.removeProperty('--color-accent-2')
      document.body.style.removeProperty('--color-bg')
    }
  }, [remoteConfig?.season?.theme])

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', display.reduceMotion)
  }, [display.reduceMotion])

  useEffect(() => {
    document.body.classList.toggle('high-contrast', display.highContrast)
  }, [display.highContrast])

  useEffect(() => {
    document.body.classList.toggle('no-animations', !settings.gameUX.animations)
  }, [settings.gameUX.animations])

  return (
    <div className="app-shell">
      {remoteBroadcast && (
        <aside
          className={`app-shell__broadcast app-shell__broadcast--${remoteBroadcast.priority ?? 'normal'}`}
          role="status"
          aria-label={remoteBroadcast.title ?? 'Broadcast announcement'}
        >
          {remoteBroadcast.title && <strong>{remoteBroadcast.title}</strong>}
          <span>{remoteBroadcast.message}</span>
        </aside>
      )}
      <main className="app-shell__main">
        <Outlet />
      </main>
      <NavBar />
      <Suspense fallback={null}>
        <DebugPanel />
        <QaManagerShortcuts />
      </Suspense>
      {/* Mount FinalFaceoff when entering jury so it can initialise the finale.
          Also remount it for the rare recovery case where jury voting already
          completed but the season finale overlay has not started yet. */}
      {phase === 'jury' &&
        seasonFinale == null &&
        (finale.isActive || !finale.hasStarted || finale.isComplete) && (
          <Suspense fallback={null}>
            <FinalFaceoff />
          </Suspense>
        )}
      {seasonFinale && (
        <Suspense fallback={null}>
          <SeasonFinaleOverlay />
        </Suspense>
      )}
      {!seasonFinale && voxPopuliActive && (
        <Suspense fallback={null}>
          <VoxPopuliFinaleOverlay />
        </Suspense>
      )}
      <PortraitOrientationGuard />
      <SaveRecoveryNotice />
      <PhonePreviewSystemChrome />
    </div>
  )
}
