/**
 * routes.tsx — single source of truth for all app routes.
 *
 * To add a new screen:
 *   1. Create your screen component in src/screens/<Name>/<Name>.tsx
 *   2. Import it below
 *   3. Add a <Route> inside the AppShell layout route
 *   That's it — no other files need changing.
 */
import { createHashRouter } from 'react-router'

import AppShell from './components/layout/AppShell'
import RouteErrorBoundary from './components/RouteErrorBoundary/RouteErrorBoundary'
import RouteLoadingScreen from './components/RouteLoadingScreen/RouteLoadingScreen'
import HomeHub from './screens/HomeHub/HomeHub'
import NotFound from './screens/NotFound/NotFound'
import SettingsAdminRoute from './routes/SettingsAdminRoute'
import { lazy, Suspense, type ReactNode } from 'react'

const GameRoute = lazy(() => import('./routes/GameRoute'))
const ConfessionalRoute = lazy(() => import('./screens/DiaryRoom/ConfessionalRoute'))
const Houseguests = lazy(() => import('./screens/Houseguests/Houseguests'))
const Profile = lazy(() => import('./screens/Profile/Profile'))
const EditProfile = lazy(() => import('./screens/Profile/EditProfile'))
const ProfilePicker = lazy(() => import('./screens/ProfilePicker/ProfilePicker'))
const Leaderboard = lazy(() => import('./screens/Leaderboard/Leaderboard'))
const Credits = lazy(() => import('./screens/Credits/Credits'))
const Week = lazy(() => import('./screens/Week/Week'))
const CreatePlayer = lazy(() => import('./screens/CreatePlayer/CreatePlayer'))
const GameOver = lazy(() => import('./screens/GameOver/GameOver'))
const SelfEvicted = lazy(() => import('./screens/SelfEvicted/SelfEvicted'))
const Rules = lazy(() => import('./screens/Rules/Rules'))
const VoxPopuliRules = lazy(() => import('./screens/Rules/VoxPopuliRules'))
const PublicMeter = lazy(() => import('./screens/PublicMeter/PublicMeter'))
const Settings = lazy(() => import('./screens/Settings/Settings'))
const Store = lazy(() => import('./screens/Store/Store'))
const Legal = lazy(() => import('./screens/Legal/Legal'))
const CinematicPreview = lazy(() => import('./screens/CinematicPreview/CinematicPreview'))
const PhonePreviewPage = lazy(() => import('./screens/PhonePreviewPage/PhonePreviewPage'))
const SeasonRecapPreview = import.meta.env.DEV
  ? lazy(() => import('./screens/SeasonRecapPreview/SeasonRecapPreview'))
  : null

const load = (element: ReactNode) => (
  <Suspense fallback={<RouteLoadingScreen />}>{element}</Suspense>
)

// Keep the QA lab in release bundles. Access remains gated inside the route,
// while production testers can audit every minigame through the central panel.
const GameDebug = lazy(() => import('./screens/GameDebug/GameDebug'))

// Manual QA page. Normal release builds omit it; local production previews can
// opt in with VITE_ENABLE_QA_ROUTES=true.
const twistsQaEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_ROUTES === 'true'
const TwistsTestPage = twistsQaEnabled
  ? lazy(() => import('./screens/TwistsTestPage/TwistsTestPage'))
  : null

// Dev-only CWGO competition test page.
const CwgoTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/CwgoTestPage/CwgoTestPage'))
  : null

// Dev-only Hold the Wall test page.
const HoldTheWallTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/HoldTheWallTestPage/HoldTheWallTestPage'))
  : null

// Dev-only Famous Figures test page.
const FamousFiguresTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/FamousFiguresTestPage/FamousFiguresTestPage'))
  : null

// Dev-only Silent Saboteur test page.
const SilentSaboteurTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/SilentSaboteurTestPage/SilentSaboteurTestPage'))
  : null

// Dev-only Risk Wheel test page.
const RiskWheelTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/RiskWheelTestPage/RiskWheelTestPage'))
  : null

// Dev-only Wildcard Western test page.
const WildcardWesternTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/WildcardWesternTestPage/WildcardWesternTestPage'))
  : null

// Dev-only Timing Bar test page.
const TimingBarTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/TimingBarTestPage/TimingBarTestPage'))
  : null

// Dev-only Grid of Luck test page.
const GridOfLuckTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/GridOfLuckTestPage/GridOfLuckTestPage'))
  : null

// Dev-only minigame lab for registry-backed QA.
const MinigameLab = import.meta.env.DEV
  ? lazy(() => import('./screens/MinigameLab/MinigameLab'))
  : null

// Dev-only, fully isolated Find Your Twin AI experiment. Production behavior is untouched.
const FindYourTwinExperiment = import.meta.env.DEV
  ? lazy(() => import('./screens/FindYourTwinExperiment/FindYourTwinExperiment'))
  : null

const FindYourTwin2 = import.meta.env.DEV
  ? lazy(() => import('./screens/FindYourTwin2/FindYourTwin2'))
  : null

// Dev-only, fully isolated Quick Tap AI experiment.
const QuickTapExperiment = import.meta.env.DEV
  ? lazy(() => import('./screens/QuickTapExperiment/QuickTapExperiment'))
  : null

export const router = createHashRouter([
  {
    path: '/cinematic',
    element: (
      <Suspense fallback={null}>
        <CinematicPreview />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  ...(SeasonRecapPreview != null
    ? [
        {
          path: '/season-recap-test',
          element: (
            <Suspense fallback={null}>
              <SeasonRecapPreview />
            </Suspense>
          ),
          errorElement: <RouteErrorBoundary />,
        },
      ]
    : []),
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomeHub /> },
      { path: 'game', element: load(<GameRoute />) },
      { path: 'diary-room', element: load(<ConfessionalRoute />) },
      { path: 'houseguests', element: load(<Houseguests />) },
      { path: 'profile', element: load(<Profile />) },
      { path: 'profile-edit', element: load(<EditProfile />) },
      { path: 'profile-picker', element: load(<ProfilePicker />) },
      { path: 'leaderboard', element: load(<Leaderboard />) },
      { path: 'credits', element: load(<Credits />) },
      { path: 'week', element: load(<Week />) },
      { path: 'create-player', element: load(<CreatePlayer />) },
      { path: 'game-over', element: load(<GameOver />) },
      { path: 'self-evicted', element: load(<SelfEvicted />) },
      { path: 'rules', element: load(<Rules />) },
      { path: 'vox-populi-rules', element: load(<VoxPopuliRules />) },
      { path: 'public-meter', element: load(<PublicMeter />) },
      { path: 'settings', element: load(<Settings />) },
      { path: 'store', element: load(<Store />) },
      { path: 'legal', element: load(<Legal />) },
      { path: 'settingsatiste', element: <SettingsAdminRoute /> },
      ...(twistsQaEnabled && TwistsTestPage != null
        ? [
            {
              path: 'twists-test',
              element: (
                <Suspense fallback={null}>
                  <TwistsTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      {
        path: 'phone-preview',
        element: (
          <Suspense fallback={null}>
            <PhonePreviewPage />
          </Suspense>
        ),
      },
      ...(import.meta.env.DEV && CwgoTestPage != null
        ? [
            {
              path: 'cwgo-test',
              element: (
                <Suspense fallback={null}>
                  <CwgoTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && HoldTheWallTestPage != null
        ? [
            {
              path: 'htw-test',
              element: (
                <Suspense fallback={null}>
                  <HoldTheWallTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && FamousFiguresTestPage != null
        ? [
            {
              path: 'ff-test',
              element: (
                <Suspense fallback={null}>
                  <FamousFiguresTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && SilentSaboteurTestPage != null
        ? [
            {
              path: 'ss-test',
              element: (
                <Suspense fallback={null}>
                  <SilentSaboteurTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && RiskWheelTestPage != null
        ? [
            {
              path: 'rw-test',
              element: (
                <Suspense fallback={null}>
                  <RiskWheelTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && WildcardWesternTestPage != null
        ? [
            {
              path: 'ww-test',
              element: (
                <Suspense fallback={null}>
                  <WildcardWesternTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && TimingBarTestPage != null
        ? [
            {
              path: 'tb-test',
              element: (
                <Suspense fallback={null}>
                  <TimingBarTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && GridOfLuckTestPage != null
        ? [
            {
              path: 'gol-test',
              element: (
                <Suspense fallback={null}>
                  <GridOfLuckTestPage />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && MinigameLab != null
        ? [
            {
              path: 'minigame-lab',
              element: (
                <Suspense fallback={null}>
                  <MinigameLab />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && FindYourTwinExperiment != null
        ? [
            {
              path: 'find-your-twin-experiment',
              element: (
                <Suspense fallback={null}>
                  <FindYourTwinExperiment />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && FindYourTwin2 != null
        ? [
            {
              path: 'find-your-twin-2',
              element: (
                <Suspense fallback={null}>
                  <FindYourTwin2 />
                </Suspense>
              ),
            },
          ]
        : []),
      ...(import.meta.env.DEV && QuickTapExperiment != null
        ? [
            {
              path: 'quick-tap-experiment',
              element: (
                <Suspense fallback={null}>
                  <QuickTapExperiment />
                </Suspense>
              ),
            },
          ]
        : []),
      {
        path: 'gamedebug',
        element: (
          <Suspense fallback={null}>
            <GameDebug />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])
