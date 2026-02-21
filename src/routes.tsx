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

import AppShell      from './components/layout/AppShell';
import HomeHub       from './screens/HomeHub/HomeHub';
import GameScreen    from './screens/GameScreen/GameScreen';
import DiaryRoom     from './screens/DiaryRoom/DiaryRoom';
import Houseguests   from './screens/Houseguests/Houseguests';
import Profile       from './screens/Profile/Profile';
import Leaderboard   from './screens/Leaderboard/Leaderboard';
import Credits       from './screens/Credits/Credits';
import Week          from './screens/Week/Week';
import CreatePlayer  from './screens/CreatePlayer/CreatePlayer';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,              element: <HomeHub />      },
      { path: 'game',             element: <GameScreen />   },
      { path: 'diary-room',       element: <DiaryRoom />    },
      { path: 'houseguests',      element: <Houseguests />  },
      { path: 'profile',          element: <Profile />      },
      { path: 'leaderboard',      element: <Leaderboard />  },
      { path: 'credits',          element: <Credits />      },
      { path: 'week',             element: <Week />         },
      { path: 'create-player',    element: <CreatePlayer /> },
    ],
  },
]);
