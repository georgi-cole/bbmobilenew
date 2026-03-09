/**
 * routes.tsx — single source of truth for all app routes.
 *
 * To add a new screen:
 *   1. Create your screen component in src/screens/<Name>/<Name>.tsx
 *   2. Import it below
 *   3. Add a <Route> inside the AppShell layout route
 *   That's it — no other files need changing.
 */
import { createHashRouter } from 'react-router-dom';

import AppShell             from './components/layout/AppShell';
import RouteErrorBoundary   from './components/RouteErrorBoundary/RouteErrorBoundary';
import HomeHub              from './screens/HomeHub/HomeHub';
import GameScreen           from './screens/GameScreen/GameScreen';
import DiaryRoom            from './screens/DiaryRoom/DiaryRoom';
import Houseguests          from './screens/Houseguests/Houseguests';
import Profile              from './screens/Profile/Profile';
import EditProfile          from './screens/Profile/EditProfile';
import ProfilePicker        from './screens/ProfilePicker/ProfilePicker';
import Leaderboard          from './screens/Leaderboard/Leaderboard';
import Week                 from './screens/Week/Week';
import CreatePlayer         from './screens/CreatePlayer/CreatePlayer';
import GameOver             from './screens/GameOver/GameOver';
import SelfEvicted          from './screens/SelfEvicted/SelfEvicted';
import Rules                from './screens/Rules/Rules';
import Settings             from './screens/Settings/Settings';
import NotFound             from './screens/NotFound/NotFound';
import { lazy, Suspense }   from 'react';
import GameDebug            from './screens/GameDebug/GameDebug';

// Credits is lazy-loaded so chunk failures are isolated and easier to debug.
const Credits = lazy(() => import('./screens/Credits/Credits'));

// Dev-only manual QA page — lazy-loaded so production bundles are unaffected.
// Vite dead-code-eliminates the dynamic import when DEV is false at build time.
const TwistsTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/TwistsTestPage/TwistsTestPage'))
  : null;

// Dev-only CWGO competition test page.
const CwgoTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/CwgoTestPage/CwgoTestPage'))
  : null;

// Dev-only Hold the Wall test page.
const HoldTheWallTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/HoldTheWallTestPage/HoldTheWallTestPage'))
  : null;

// Dev-only Famous Figures test page.
const FamousFiguresTestPage = import.meta.env.DEV
  ? lazy(() => import('./screens/FamousFiguresTestPage/FamousFiguresTestPage'))
  : null;

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true,              element: <HomeHub />      },
      { path: 'game',             element: <GameScreen />   },
      { path: 'diary-room',       element: <DiaryRoom />    },
      { path: 'houseguests',      element: <Houseguests />  },
      { path: 'profile',          element: <Profile />      },
      { path: 'profile-edit',     element: <EditProfile />  },
      { path: 'profile-picker',   element: <ProfilePicker /> },
      { path: 'leaderboard',      element: <Leaderboard />  },
      { path: 'credits',          element: <Suspense fallback={null}><Credits /></Suspense> },
      { path: 'week',             element: <Week />         },
      { path: 'create-player',    element: <CreatePlayer /> },
      { path: 'game-over',        element: <GameOver />     },
      { path: 'self-evicted',     element: <SelfEvicted />  },
      { path: 'rules',            element: <Rules />        },
      { path: 'settings',         element: <Settings />     },
      ...(import.meta.env.DEV && TwistsTestPage != null
        ? [{ path: 'twists-test', element: <Suspense fallback={null}><TwistsTestPage /></Suspense> }]
        : []),
      ...(import.meta.env.DEV && CwgoTestPage != null
        ? [{ path: 'cwgo-test', element: <Suspense fallback={null}><CwgoTestPage /></Suspense> }]
        : []),
      ...(import.meta.env.DEV && HoldTheWallTestPage != null
        ? [{ path: 'htw-test', element: <Suspense fallback={null}><HoldTheWallTestPage /></Suspense> }]
        : []),
      ...(import.meta.env.DEV && FamousFiguresTestPage != null
        ? [{ path: 'ff-test', element: <Suspense fallback={null}><FamousFiguresTestPage /></Suspense> }]
        : []),
      { path: 'gamedebug',        element: <GameDebug />    },
      { path: '*',                element: <NotFound />     },
    ],
  },
]);
