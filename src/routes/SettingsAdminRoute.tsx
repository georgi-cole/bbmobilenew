import { lazy, Suspense } from 'react';
import NotFound from '../screens/NotFound/NotFound';
import { canAccessSpecialSettings } from '../utils/debugMode';

const SettingsAdmin = lazy(() => import('../screens/SettingsAdmin/SettingsAdmin'));

export default function SettingsAdminRoute() {
  return import.meta.env.DEV || canAccessSpecialSettings()
    ? (
        <Suspense fallback={null}>
          <SettingsAdmin />
        </Suspense>
      )
    : <NotFound />;
}
